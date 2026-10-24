/**
 * 全局对象
 */
const globalContext = (() => {

	////////////////////////////////////////////////////////////////////////
	// 接口
	////////////////////////////////////////////////////////////////////////

	/** linux文件操作 */
	const fopen = new NativeFunction(Module.getExportByName(null, 'fopen'), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
	const fread = new NativeFunction(Module.getExportByName(null, 'fread'), 'int', ['pointer', 'int', 'int', 'int'], { "abi": "sysv" });
	const fclose = new NativeFunction(Module.getExportByName(null, 'fclose'), 'int', ['int'], { "abi": "sysv" });
	const opendir = new NativeFunction(Module.getExportByName(null, 'opendir'), 'int', ['pointer'], { "abi": "sysv" });
	const closedir = new NativeFunction(Module.getExportByName(null, 'closedir'), 'int', ['int'], { "abi": "sysv" });
	const mkdir = new NativeFunction(Module.getExportByName(null, 'mkdir'), 'int', ['pointer', 'int'], { "abi": "sysv" });

	/** 服务器环境 */
	const G_CEnvironment = new NativeFunction(ptr(0x080CC181), 'pointer', [], { "abi": "sysv" });
	/** 获取当前服务器配置文件名 */
	const CEnvironment_Get_File_Name = new NativeFunction(ptr(0x80DA39A), 'pointer', ['pointer'], { "abi": "sysv" });

	////////////////////////////////////////////////////////////////////////
	// 变量 
	////////////////////////////////////////////////////////////////////////

	// 日志相关
	let _fLog = null;
	let _logDay = null;
	let _logDir = '/plugins/frida/log/';// 日志目录 '/home/neople/game/log/'

	//配置相关
	let _configPath = '/plugins/frida/frida_config.json';// 全局配置文件默认路径
	/** 配置（通过加载配置文件初始化） */
	let _config = {};

	/** 缓存模块，用于存储已加载的模块，避免重复加载 */
	const _moduleCache = {};
	/** 用于程序第一次启动与结束时控制freeze类型模块卸载 */
	let _deactivateFreeze = false;

	////////////////////////////////////////////////////////////////////////
	// 公共
	////////////////////////////////////////////////////////////////////////

	/** 消息类型 */
	const LOG_LEVELS = {
		INFO: 'INFO',
		WARN: 'WARN',
		ERROR: 'ERROR'
	}

	/** 通用函数和游戏工具对象，供各个模块调用 */
	const context = {
		main: {
			api_mkdir, readFile, loadConfig,
			log, LOG_LEVELS,
			api_CEnvironment_Get_File_Name,
			module: {
				reinit: _initMain,
				reload: (moduleName) => _moduleManager.reload(moduleName)
			}
		}, // 基础函数 
	};

	/**
	* 获取游戏频道名
	* @returns 频道名
	*/
	function api_CEnvironment_Get_File_Name() {
		var filename = CEnvironment_Get_File_Name(G_CEnvironment());
		return filename.readUtf8String(-1);
	}

	/**
	 * 创建文件夹
	 * @param {*} path 路径
	 * @returns 
	 */
	function api_mkdir(path) {
		var path_ptr = Memory.allocUtf8String(path);
		var dir = opendir(path_ptr);
		if (dir) {
			closedir(dir);
			return true;
		}
		return mkdir(path_ptr, 0x1FF);
	}

	/**
	 * 读取文件
	 * @param {*} path 路径
	 * @param {*} mode 模式
	 * @param {*} len 长度 
	 * @returns 
	 */
	function readFile(path, mode, len) {
		path = path.trim();
		if (!path || !mode || !len)
			return null;
		var path_ptr = Memory.allocUtf8String(path);
		var mode_ptr = Memory.allocUtf8String(mode);
		var f = fopen(path_ptr, mode_ptr);

		if (f == 0) {
			context.main.log(LOG_LEVELS.ERROR, `[readFile] Failed to open file: ${path}`);
			return null;
		}

		var data = Memory.alloc(len);
		var fread_ret = fread(data, 1, len, f);

		fclose(f);

		// 返回字符串
		if (mode == 'r')
			return data.readUtf8String(fread_ret);

		// 返回二进制buff指针
		return data;
	}

	/**
	 * 读取配置文件
	 * @param {*} path 路径
	 * @returns 配置对象
	 */
	function loadConfig(path) {
		try {
			var data = context.main.readFile(path, 'r', 10 * 1024 * 1024);
			if (!data) {
				throw new Error(`Failed to read config file: ${path}`);
			}
			return JSON.parse(data);
		} catch (error) {
			context.main.log(LOG_LEVELS.ERROR, `[Config] Failed to load config:\n`, error.stack);
			return null;
		}
	}

	/** 文件记录日志 */
	function log(...args) {
		var date = new Date();
		var year = date.getFullYear().toString();
		var month = (date.getMonth() + 1).toString();
		var day = date.getDate().toString();
		var hour = date.getHours().toString();
		var minute = date.getMinutes().toString();
		var second = date.getSeconds().toString();
		var ms = date.getMilliseconds().toString();

		// 日志按日期记录
		if ((_fLog == null) || (_logDay != day)) {
			// 释放f_log
			if (_fLog) {
				_fLog.close();
				_fLog = null;
			}
			context.main.api_mkdir(_logDir);
			_fLog = new File(_logDir + 'frida_' + context.main.api_CEnvironment_Get_File_Name() + '_' + year + '_' + month + '_' + day + '.log', 'a+');
			_logDay = day;
		}

		// 处理消息
		let level = LOG_LEVELS.INFO;
		let msg;
		if (LOG_LEVELS.hasOwnProperty(args[0])) {
			[level, ...msg] = args;
			msg = msg.join(' ');
		}
		else
			msg = args.join(' ');

		// 时间戳
		var timestamp = year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second + '.' + ms;

		// 控制台日志
		if (level !== LOG_LEVELS.INFO)
			console.log('[Frida]' + `[${level}] ` + /*timestamp + ' ' +*/ msg);

		// 文件日志 
		_fLog.write(`[${timestamp}] [${level}] ${msg}\n`);
		// 立即写日志到文件中
		_fLog.flush();
	}

	////////////////////////////////////////////////////////////////////////
	//私有
	////////////////////////////////////////////////////////////////////////

	/**
	 * 自定义模块加载函数，实现类似Node.js的require功能
	 * 支持模块缓存、文件读取和模块封装执行
	 * @param {string} path - 模块文件的路径
	 * @param {*} context - 模块上下文
	 * @returns {object} - 模块导出的内容 
	 */
	function _require(path, context, name = '') {
		// 检查模块是否已缓存，避免重复加载
		if (_moduleCache[path]) return _moduleCache[path];

		// 读取模块文件内容，以文本模式读取，最大支持10MB
		const src = context.main.readFile(path, 'r', 10 * 1024 * 1024);
		if (src === null) {
			throw new Error(`[Require] Failed to read module file: ${path}`);
		}

		// 模块的代码会通过修改 module.exports 来导出值
		const module = { name: name, exports: {} };

		// 把模块源码包装成匿名函数，有三个参数： module, context, require ，函数的函数体（代码逻辑）就是 src。目前取消 require 防止循环问题
		new Function("module", "context", /*"require",*/ src)(module, context /*,require*/);

		// 缓存模块导出值
		_moduleCache[path] = module.exports;

		return module.exports;
	}

	/** Hook管理。用于注册、注销Hook */
	const _hookManager = {
		/**
		 * 存放活动的Hooks
		 * key address
		 * value hook相关信息对象
		 * @type {Map<string, {listener: any, onEnters: any[], onLeaves: any[]}>}
		 */
		_activeHooks: new Map(),

		/**
		 * 注册Hook回调
		 * @param {string} address Hook地址
		 * @param {object} hookInfo 包含 onEnter, onLeave
		 * @param {string} moduleName 模块名，用于追踪
		 */
		register(address, hookInfo, moduleName) {
			const normAddress = ptr(address).toString();
			const isAttachHook = hookInfo.onEnter || hookInfo.onLeave;
			const isReplaceHook = typeof hookInfo.replace === 'function';

			// 如果这个地址从未被Hook过
			if (!this._activeHooks.has(normAddress)) {
				const hookEntry = { listener: null, };// _activeHooks的value
				// 处理attach
				if (isAttachHook) {
					hookEntry.type = 'attach';
					hookEntry.onEnters = hookInfo.onEnter ? [{ hook: hookInfo.onEnter, moduleName }] : [];
					hookEntry.onLeaves = hookInfo.onLeave ? [{ hook: hookInfo.onLeave, moduleName }] : [];

					hookEntry.listener = Interceptor.attach(ptr(normAddress), {
						onEnter(args) {
							// 执行所有注册到此地址的 onEnter 回调
							hookEntry.onEnters.forEach(fn => {
								try {
									fn.hook.call(this, args);
								} catch (error) {
									context.main.log(LOG_LEVELS.ERROR, `[Hook] onEnter at '${normAddress}' in '${fn.moduleName}':\n`, error.stack);
								}
							});
						},
						onLeave(retval) {
							// 执行所有注册到此地址的 onLeave 回调
							hookEntry.onLeaves.forEach(fn => {
								try {
									fn.hook.call(this, retval);
								} catch (error) {
									context.main.log(LOG_LEVELS.ERROR, `[Hook] onLeave at '${normAddress}' in '${fn.moduleName}':\n`, error.stack);
								}
							});
						},
					});
				}
				else if (isReplaceHook) {// 处理 replace hook
					if (!hookInfo.retType || !hookInfo.argTypes) {
						context.main.log(LOG_LEVELS.ERROR, `[Registry] Module '${moduleName}' hook for '${normAddress}' is missing a valid  property. Skipped.`);
						return;
					}
					hookEntry.owner = moduleName;
					hookEntry.type = 'replace';
					try {
						hookEntry.callback = new NativeCallback(hookInfo.replace, hookInfo.retType, hookInfo.argTypes);
						Interceptor.replace(ptr(normAddress), hookEntry.callback);
					} catch (error) {
						context.main.log(LOG_LEVELS.ERROR, `[Replace] Failed to replace function at '${normAddress}' for module '${moduleName}':\n`, error.stack);
						return;
					}
				}
				this._activeHooks.set(normAddress, hookEntry);
				context.main.log(`[Registry] New Interceptor ${hookEntry.type} at '${normAddress}' by module '${moduleName}'.`);
				return;
			}

			// 检查冲突 attach可以多个，而replace只能1个且不能共存
			const existingEntry = this._activeHooks.get(normAddress);
			if (existingEntry.type === 'attach' && isAttachHook) {
				// 统一的回调注册函数
				const registerCallback = (callbacks, hook, hookType) => {
					const alreadyExists = callbacks.some(cb => cb.moduleName === moduleName);
					if (!alreadyExists) {
						callbacks.push({ hook, moduleName });
					} else {
						context.main.log(LOG_LEVELS.WARN, `[Registry] Module '${moduleName}' already has an ${hookType} hook for ${normAddress}. New one skipped.`);
					}
				};
				// 将当前模块的回调添加到列表中
				if (hookInfo.onEnter)
					registerCallback(existingEntry.onEnters, hookInfo.onEnter, 'onEnter');
				if (hookInfo.onLeave)
					registerCallback(existingEntry.onLeaves, hookInfo.onLeave, 'onLeave');

			} else {
				// 冲突处理
				const owner = existingEntry.type === 'replace' ? `'${existingEntry.owner}'` : 'one or more modules via attach';
				context.main.log(LOG_LEVELS.WARN, `[Registry] Module '${moduleName}' failed to hook address '${normAddress}'. It is already hooked by ${owner}.`);
			}
		},
		/**
		 * 从指定地址移除特定模块的所有Hook回调
		 * @param {string} address Hook地址
		 * @param {string} moduleName 要移除的模块名
		 */
		unregister(address, moduleName) {
			const normAddress = ptr(address).toString();
			const hookEntry = this._activeHooks.get(normAddress);
			if (!hookEntry) return;

			// 根据hook类型进行不同的卸载操作
			if (hookEntry.type === 'attach') {
				// 过滤掉属于该模块的回调
				hookEntry.onEnters = hookEntry.onEnters.filter(cb => cb.moduleName !== moduleName);
				hookEntry.onLeaves = hookEntry.onLeaves.filter(cb => cb.moduleName !== moduleName);

				// 如果移除后没有任何回调了，就detach这个Interceptor
				if (hookEntry.onEnters.length === 0 && hookEntry.onLeaves.length === 0) {
					hookEntry.listener.detach();
					this._activeHooks.delete(normAddress);
					context.main.log(`[Registry] Interceptor detached from '${normAddress}' as no modules are listening.`);
				}
			} else if (hookEntry.type === 'replace' && hookEntry.owner === moduleName) {
				Interceptor.revert(ptr(normAddress)); // 使用 revert 恢复原函数
				Interceptor.flush();
				this._activeHooks.delete(normAddress);
				context.main.log(`[Registry] Original function at '${normAddress}' was restored (was replaced by '${moduleName}').`);
			}
		}
	}

	/** 模块管理。用于加载、卸载模块 */
	const _moduleManager = {
		/**
		* 已加载的模块	 
		* key：模块名
		* value：模块的相关信息对象
		* @type {Map<string, {config: name:string, path:string, enable:bool ...}, exports: object}>} 
		*/
		_loadedModules: new Map(),
		_modulesConfig: [],

		/**
		 * 根据配置加载模块
		 * @param {*} moduleConfig {name:string, path:string, enable:bool ...}
		 * @returns 
		 */
		_loadModule(moduleConfig) {
			if (this._loadedModules.has(moduleConfig.name))
				return true;
			try {
				delete _moduleCache[moduleConfig.path];// 删除require缓存
				// 加载模块
				const moduleExports = _require(moduleConfig.path, context, moduleConfig.name);
				if (!moduleExports)
					throw new Error('Module parsing failed, please check module file!');

				const moduleInstance = {
					config: moduleConfig,
					exports: moduleExports,
				};

				// 初始化模块
				if (typeof moduleInstance.exports.init === 'function') {
					moduleInstance.exports.init();
					context.main.log(`[Module] '${moduleConfig.name}'  initialization completed.`);
				}

				// 调用注册
				(moduleInstance.exports.hooks || []).forEach((hookInfo, index) => {
					if (hookInfo.address)
						_hookManager.register(hookInfo.address, hookInfo, moduleConfig.name);
					else
						// 记录警告，指明哪个模块的哪个 Hook 缺少地址
						context.main.log(LOG_LEVELS.WARN, `[Registry] Module '${moduleConfig.name}' (Hook index ${index}) is missing an 'address' property. This hook will be skipped.`);
				});

				// 基础模块将其api添加到全局对象上（同时支持 context['utils.cuser'] 与嵌套访问 context.utils.cuser）
				if (moduleConfig.isBaseModule) {
					const exportedApi = moduleInstance.exports.api ?? moduleInstance.exports;
					context[moduleConfig.name] = exportedApi;
					if (moduleConfig.name.includes('.')) {
						const parts = moduleConfig.name.split('.');
						let target = context;
						for (let i = 0; i < parts.length - 1; i++) {
							if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
								target[parts[i]] = {};
							}
							target = target[parts[i]];
						}
						target[parts[parts.length - 1]] = exportedApi;
					}
				}
				this._loadedModules.set(moduleConfig.name, moduleInstance);

				context.main.log(`[Module] '${moduleConfig.name}' loaded successfully.`);
				return true;
			} catch (error) {
				context.main.log(LOG_LEVELS.ERROR, `[Module] loading module '${moduleConfig.name}':\n`, error.stack);
				return false;
			}
		},
		/**
		 * 根据模块名卸载模块
		 * @param {*} moduleName  
		 */
		_unloadModule(moduleName) {
			const moduleInstance = this._loadedModules.get(moduleName);
			if (!moduleInstance)
				return true;
			try {
				// 调用模块的 dispose 方法（如果存在）
				if (moduleInstance.exports && typeof moduleInstance.exports.dispose === 'function') {
					moduleInstance.exports.dispose();
					context.main.log(`[Module] '${moduleName}' dispose completed.`);
				}

				// 遍历保存的hooks配置，通知注册表移除它们
				(moduleInstance.exports.hooks || []).forEach(hookInfo => {
					_hookManager.unregister(hookInfo.address, moduleName);
				});

				// 如果是基础模块，还需要从全局里删除
				if (moduleInstance.config.isBaseModule) {
					delete context[moduleName];
					if (moduleName.includes('.')) {
						const parts = moduleName.split('.');
						let target = context;
						for (let i = 0; i < parts.length - 1; i++) {
							target = target?.[parts[i]];
						}
						if (target && typeof target === 'object') {
							delete target[parts[parts.length - 1]];
						}
					}
				}
				delete _moduleCache[moduleInstance.config.path];
				this._loadedModules.delete(moduleName);

				context.main.log(`[Module] '${moduleName}' unloaded successfully.`);
				return true;
			} catch (error) {
				context.main.log(LOG_LEVELS.ERROR, `[Module] unload module '${moduleName}':\n`, error.stack);
				return false;
			}
		},
		/**
		* 初始化模块配置
		* @param {Array} baseModulesCfg 基础模块配置
		* @param {Array} modulesCfg 功能模块配置
		*/
		init(baseModulesCfg, modulesCfg) {
			// 合并配置，标记模块类型
			this._modulesConfig = [
				...(baseModulesCfg || []).map(cfg => ({ ...cfg, isBaseModule: true })),
				...(modulesCfg || []).map(cfg => ({ ...cfg, isBaseModule: false }))
			];
		},
		/**
		 * 加载指定类型模块
		 * @param {*} baseModule 
		 */
		loadAll(baseModule = false) {
			this._modulesConfig?.forEach(cfg => {
				if (cfg.enabled && cfg.isBaseModule === baseModule)
					this._loadModule(cfg);
			});
		},
		/**
		 * 卸载指定类型模块
		 * @param {*} baseModule 
		 * @returns 
		 */
		unloadAll(baseModule = false) {
			let result = true;
			const entries = Array.from(this._loadedModules?.entries() || []).reverse();
			entries.forEach(([name, value]) => {
				if (value.config.freeze && !_deactivateFreeze)
					return;
				if (value.config.isBaseModule !== baseModule)// 跳过非指定类型的模块
					return;
				if (!this._unloadModule(name))
					result = false;
			});
			return result;
		},
		/**
		 * 重新加载模块（可单独指定某个模块）
		 * @param {*} moduleName  
		 */
		reload(moduleName = null) {
			let result = true;// 目前记录卸载状态

			if (moduleName) {
				context.main.log(`================ Reloading module: ${moduleName} ================`);

				const config = this._modulesConfig.find(cfg => cfg.name === moduleName && cfg.enabled);
				if (!config) {// 如果未找到配置，则记录错误日志
					result = this._unloadModule(moduleName);
					context.main.log(`================ Module ${moduleName} Not Found Or Disabled  ================`);
					return false;
				}
				result = this._unloadModule(moduleName);
				if (result)
					result = this._loadModule(config);

				context.main.log(`================ Module ${moduleName} reloaded ================`);
			}
			else {
				context.main.log(`================ Reloading ALL modules ================`);
				result = _moduleManager.unloadAll();
				_moduleManager.loadAll();
				context.main.log(`================ ALL modules reloaded ================`);
			}
			return result;
		},
	}

	/** 主程序初始化 */
	function _initMain() {
		context.main.log('**************** Main Init Start ****************');

		// 卸载基础模块
		_moduleManager.unloadAll(true);
		// 加载配置
		_config = context.main.loadConfig(_configPath);
		if (!_config)
			throw new Error('[InitMain] Invalid configuration file format');
		context.config = _config.common;// 加载全局通用配置
		context.main.log(`[Main] 'config' read successfully.`);

		// 加载基础模块
		_moduleManager.init(_config.base.modules, _config.modules);// 初始化模块配置
		_moduleManager.loadAll(true);

		context.main.log('**************** Main Init Completed ****************');
	}

	/** 内部启动入口 */
	function _start() {
		try {
			context.main.log('---------------- [Frida Init] Start ----------------');
			// 初始化主要配置
			_deactivateFreeze = true;
			_initMain();
			_deactivateFreeze = false;
			// 加载模块
			context.main.log(`================ Loading ALL modules ================`);
			_moduleManager.loadAll();
			context.main.log(`================ ALL modules loaded ================`);
		} catch (error) {
			context.main.log(LOG_LEVELS.ERROR, '[Start]', error.stack)
		}
	}

	/** 资源释放 */
	function _dispose() {
		try {
			// 先卸载功能模块，再卸载基础模块
			_deactivateFreeze = true;
			_moduleManager.unloadAll();
			_moduleManager.unloadAll(true);
			_deactivateFreeze = false;
			context.main.log('---------------- [Frida Dispose] Completed ----------------');
		} catch (error) {
			context.main.log(LOG_LEVELS.ERROR, '[Dispose]', error.stack)
		}
	}

	////////////////////////////////////////////////////////////////////////
	// 公共接口
	////////////////////////////////////////////////////////////////////////
	return {
		...context,
		_start,
		_dispose
	}
})();

////////////////////////////////////////////////////////////////////////
// Frida 入口
//////////////////////////////////////////////////////////////////////// 

/** 延迟加载插件 */
function awake() {
	// Hook check_argv
	Interceptor.attach(ptr(0x829EA5A), {

		onEnter: function (args) {
		},
		onLeave: function (retval) {
			// 等待check_argv函数执行结束 再加载插件			
			globalContext._start();
		}
	});
}

// 导出RPC接口
rpc.exports = {
	// 初始化函数 
	init: function (stage, parameters) {
		console.log('[Frida] stage=' + stage + ', parameters=' + JSON.stringify(parameters) + '  ====================================');
		try {
			if (stage == 'early') {
				// 首次加载插件 等待服务器初始化后再加载
				awake();
			}
			else {
				// 热重载:  直接加载
				globalContext._start();
			}
		} catch (error) {
			console.log('[Frida Error] ', error);
		}
	},
	// 资源释放函数
	dispose: function () {
		globalContext._dispose();
	}
};


// const fileName = path.basename(moduleConfig.path);
// let prefix;

// if (fileName.startsWith('core-')) {
//     prefix = 'core';
// } else if (fileName.startsWith('base-')) {
//     prefix = 'base';
// } else if (fileName.startsWith('extend-')) {
//     prefix = 'extend';
// } else {
//     prefix = 'base';
// }

// context[prefix] = context[prefix] || {};
// context[prefix][moduleConfig.name] = moduleInstance.exports.api ?? moduleInstance.exports;