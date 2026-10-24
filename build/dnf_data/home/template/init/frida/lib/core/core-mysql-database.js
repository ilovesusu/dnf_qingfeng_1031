/**
 * core-mysql-database.js
 * mysql数据库管理模块(系统核心模块) 
 * 20250901 by Tim
 */

/** 读取进程环境变量（兼容 Docker 容器环境变量自动注入） */
const _c_getenv = new NativeFunction(Module.getExportByName(null, 'getenv'), 'pointer', ['pointer'], { "abi": "sysv" });
function _getEnv(name) {
    try {
        const ptrVal = _c_getenv(Memory.allocUtf8String(name));
        if (ptrVal && !ptrVal.isNull()) {
            const s = ptrVal.readUtf8String(-1);
            if (s && s.length > 0) return s;
        }
    } catch (_) { }
    return null;
}

const _customDb = (context.config && context.config.db) || {};
const _envSgPort = parseInt(_getEnv('SG_DB_PROXY_PORT') || '', 10);
const _rawSgDb = _customDb.serverGroupDb || _getEnv('SERVER_GROUP_DB') || 'cain';
const _serverGroupDbName = _rawSgDb.indexOf('taiwan_') === 0 ? _rawSgDb : ('taiwan_' + _rawSgDb);
const _serverGroup = _customDb.serverGroup || _getEnv('SERVER_GROUP') || '3';

/** 默认连接配置（优先级：frida_config.json common.db > 容器环境变量 > 默认值） */
const _defaultConnect = {
    ip: _customDb.ip || '127.0.0.1',
    port: _customDb.port || (_envSgPort > 0 ? _envSgPort : 3306),
    userName: _customDb.userName || _getEnv('DB_USER') || 'game',
    password: _customDb.password || _getEnv('DNF_DB_GAME_PASSWORD') || 'uu5!^%jg'
};
/** 模块配置 */
var _config = {
    connections: {
        [_serverGroupDbName]: { ..._defaultConnect },
        'frida': { ..._defaultConnect }
    }
}

function _resolveDbName(dbName) {
    if (dbName === 'taiwan_cain') return _serverGroupDbName;
    return dbName;
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const { getTimestamp } = context.system.time;

const { api_ScheduleOnMainThread } = context.system.thread;

// --------------- 数据库连接 相关接口 ------------------

var MySQL_MySQL = new NativeFunction(ptr(0x83F3AC8), 'pointer', ['pointer'], { "abi": "sysv" });
var MySQL_Init = new NativeFunction(ptr(0x83F3CE4), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_Open = new NativeFunction(ptr(0x83F4024), 'int', ['pointer', 'pointer', 'int', 'pointer', 'pointer', 'pointer'], { "abi": "sysv" });
var MySQL_Close = new NativeFunction(ptr(0x83F3E74), 'int', ['pointer'], { "abi": "sysv" });

// --------------- 数据库操作 相关接口 ------------------

var MySQL_Set_Query_2 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var MySQL_Set_Query_3 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'pointer'], { "abi": "sysv" });
var MySQL_Set_Query_3_Int = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
var MySQL_set_query_4 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int', 'int'], { "abi": "sysv" });
var MySQL_set_query_5 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int', 'int', 'int'], { "abi": "sysv" });
var MySQL_set_query_6 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int', 'int', 'int', 'int'], { "abi": "sysv" });
var MySQL_Exec = new NativeFunction(ptr(0x83F4326), 'int', ['pointer', 'int'], { "abi": "sysv" });
var MySQL_exec_query = new NativeFunction(ptr(0x083F5348), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_Get_N_Rows = new NativeFunction(ptr(0x80E236C), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_Fetch = new NativeFunction(ptr(0x83F44BC), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_Get_Int = new NativeFunction(ptr(0x811692C), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });
var MySQL_Get_Short = new NativeFunction(ptr(0x0814201C), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });
var MySQL_Get_Uint = new NativeFunction(ptr(0x80E22F2), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });
var MySQL_Get_Ulonglong = new NativeFunction(ptr(0x81754C8), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });
var MySQL_get_ushort = new NativeFunction(ptr(0x8116990), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_Get_Float = new NativeFunction(ptr(0x844D6D0), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });
var MySQL_Get_Binary = new NativeFunction(ptr(0x812531A), 'int', ['pointer', 'int', 'pointer', 'int'], { "abi": "sysv" });
var MySQL_Get_Binary_Length = new NativeFunction(ptr(0x81253DE), 'int', ['pointer', 'int'], { "abi": "sysv" });
var MySQL_get_str = new NativeFunction(ptr(0x80ECDEA), 'int', ['pointer', 'int', 'pointer', 'int'], { "abi": "sysv" });
var MySQL_blob_to_str = new NativeFunction(ptr(0x83F452A), 'pointer', ['pointer', 'int', 'pointer', 'int'], { "abi": "sysv" });

////////////////////////////////////////////////////////////////////////
// 变量
////////////////////////////////////////////////////////////////////////

/** 存储活跃的数据库连接 */
let _connections = new Map();

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

/**安全的执行函数 */
function api_MySQL_Exec_Safe(mysql, sql, ...params) {
    const sql_ptr = Memory.allocUtf8String(sql);

    // 根据参数数量选择不同的函数 
    if (params.length === 0) {
        // 使用 '%s' 包装，防止 sql 中包含 '%' 字符时被底层 vsnprintf 当作格式化占位符导致崩溃
        const fmt_ptr = Memory.allocUtf8String('%s');
        MySQL_Set_Query_3(mysql, fmt_ptr, sql_ptr);
    } else if (params.length === 1) {
        // 根据参数类型调用不同的底层函数或直接传递
        if (typeof params[0] === 'number') {
            MySQL_Set_Query_3_Int(mysql, sql_ptr, params[0]);
        } else {
            const param_ptr = Memory.allocUtf8String(params[0]);
            MySQL_Set_Query_3(mysql, sql_ptr, param_ptr);
        }
    } else {
        // 后续有更多参数再添加
        return -1; // 返回错误码
    }

    return MySQL_Exec(mysql, 1);
}

/**
 * 查询sql结果
 *使用前务必保证api_MySQL_exec返回0, 并且MySQL_get_n_rows与预期一致
 */
function api_MySQL_Get_Int(mysql, field_index) {
    var v = Memory.alloc(4);
    if (1 == MySQL_Get_Int(mysql, field_index, v))
        return v.readInt();
    // log('api_MySQL_get_int Fail!!!');
    return null;
}
function api_MySQL_get_uint(mysql, field_index) {
    var v = Memory.alloc(4);
    if (1 == MySQL_Get_Uint(mysql, field_index, v))
        return v.readUInt();
    // log('api_MySQL_get_uint Fail!!!');
    return null;
}
function api_MySQL_get_short(mysql, field_index) {
    var v = Memory.alloc(4);
    if (1 == MySQL_Get_Short(mysql, field_index, v))
        return v.readShort();
    // log('MySQL_get_short Fail!!!');
    return null;
}
function api_MySQL_get_float(mysql, field_index) {
    var v = Memory.alloc(4);
    if (1 == MySQL_Get_Float(mysql, field_index, v))
        return v.readFloat();
    // log('MySQL_get_float Fail!!!');
    return null;
}
function api_MySQL_Get_Str(mysql, field_index) {
    var binary_length = MySQL_Get_Binary_Length(mysql, field_index);
    if (binary_length > 0) {
        var v = Memory.alloc(binary_length);
        if (1 == MySQL_Get_Binary(mysql, field_index, v, binary_length))
            return v.readUtf8String(binary_length);
    }

    // log('MySQL_get_str Fail!!!');
    return null;
}
function api_MySQL_get_binary(mysql, field_index) {
    var binary_length = MySQL_Get_Binary_Length(mysql, field_index);
    if (binary_length > 0) {
        var v = Memory.alloc(binary_length);
        if (1 == MySQL_Get_Binary(mysql, field_index, v, binary_length))
            return v.readByteArray(binary_length);
    }

    // log('api_MySQL_get_binary Fail!!!');
    return null;
}

/** 根据配置文件初始化连接，如果数据库不存在则尝试创建数据库 */
function _initConnections() {
    if (_config && _config.connections) {
        Object.entries(_config.connections).forEach(([key, value]) => {
            const dbName = key;
            const dbConfig = value ?? { ..._defaultConnect, ...(value || {}) };//判断是否使用默认属性

            let result = dbConnector.init(dbName, dbConfig.ip, dbConfig.port, dbConfig.userName, dbConfig.password);
            if (result)// 成功直接跳过
                return;
            // 创建数据库
            result = _createDb(dbName, dbConfig.ip, dbConfig.port, dbConfig.userName, dbConfig.password);
            if (!result) {
                log(ERROR, `[${module.name}]`, `Failed to get connection to ${dbConfig.ip}:${dbConfig.port}. Cannot create database '${dbName}'.`);
                return;
            }
            // 创建成功初始化
            result = dbConnector.init(dbName, dbConfig.ip, dbConfig.port, dbConfig.userName, dbConfig.password);
            if (result)
                log(WARN, `[${module.name}]`, `Successfully connected to database: '${dbName}' at ${dbConfig.ip}:${dbConfig.port}.`);
            else
                log(ERROR, `[${module.name}]`, `Created '${dbName}' but Failed to connect afterwards!`);
        });
        return true;
    }
    return false;
}

/**创建数据库，通过空数据库名建立连接创建指定数据库 */
function _createDb(dbName, ip, port, userName, password) {
    // 通过无库名的管理连接创建目标数据库
    if (!dbConnector.init(null, ip, port, userName, password))
        return false;

    const mysql = dbConnector.get(null, ip, port);

    // 创建数据库
    const createSql = `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8;`;
    const result = api_MySQL_Exec_Safe(mysql, createSql);
    dbConnector.close('', ip, port);

    return result ? true : false;
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

/**
 * 数据库通用工具
 */
const dbUtils = {
    MySQL_Get_N_Rows,
    MySQL_Fetch,
    api_MySQL_Get_Int,
    api_MySQL_get_uint,
    api_MySQL_get_short,
    api_MySQL_get_float,
    api_MySQL_Get_Str,
    api_MySQL_get_binary,

    api_MySQL_Exec_Safe
}

/**
 * 数据库连接管理器
 */
const dbConnector = {

    /**
     * 初始化数据库连接
     * @param {string} dbName 数据库名
     * @param {string} ip 数据库IP
     * @param {number} port 数据库端口
     * @param {string} userName 数据库用户名
     * @param {string} password 数据库密码
     * @returns {boolean} 连接是否成功
     */
    init(dbName, ip, port, userName, password) {
        if (!dbName)
            dbName = '';
        const connectionKey = `${dbName}_${ip}_${port}`;
        // 如果连接已存在，直接返回
        if (_connections.has(connectionKey)) {
            return true;
        }

        // 创建新连接
        let mysql = Memory.alloc(0x80000);
        MySQL_MySQL(mysql);
        MySQL_Init(mysql);

        // 连接数据库
        let ipPtr = Memory.allocUtf8String(ip);
        let dbNamePtr = Memory.allocUtf8String(dbName);
        let accountPtr = Memory.allocUtf8String(userName);
        let passwordPtr = Memory.allocUtf8String(password);
        let ret = MySQL_Open(mysql, ipPtr, port, dbNamePtr, accountPtr, passwordPtr);

        if (ret) {
            // 保存连接信息
            _connections.set(connectionKey, {
                mysql: mysql,
                dbName: dbName,
                ip: ip,
                port: port,
                createdAt: Date.now()
            });
            return true;
        }
        return false;
    },
    /**
     * 获取数据库连接
     * @param {string} dbName 数据库名
     * @param {string} ip 数据库IP  
     * @param {number} port 数据库端口
     * @returns {pointer|null} MySQL连接指针
     */
    get(dbName, ip, port) {
        if (!dbName)
            dbName = '';
        const connectionKey = `${dbName}_${ip}_${port}`;
        const connection = _connections.get(connectionKey);
        if (!connection)
            throw new Error(`[${module.name}] '${dbName}' at ${ip}:${port} does not exist or has been disconnected!`);

        return connection.mysql;
    },
    /**
     * 关闭指定数据库连接
     * @param {string} dbName 数据库名
     * @param {string} ip 数据库IP
     * @param {number} port 数据库端口
     */
    close(dbName, ip, port) {
        const connectionKey = `${dbName}_${ip}_${port}`;
        const connection = _connections.get(connectionKey);

        if (connection) {
            MySQL_Close(connection.mysql);
            _connections.delete(connectionKey);
        }
    },
    /**
     * 关闭所有数据库连接
     */
    closeAll() {
        _connections.forEach((connection, key) => {
            MySQL_Close(connection.mysql);
        });
        _connections.clear();
    },
    /**
     * 获取连接状态信息
     * @returns {Array} 连接状态列表
     */
    getStatus() {
        const status = [];
        _connections.forEach((connection, key) => {
            status.push({
                key: key,
                dbName: connection.dbName,
                ip: connection.ip,
                port: connection.port,
                createdAt: connection.createdAt,
                uptime: Date.now() - connection.createdAt
            });
        });
        return status;
    },
    /**
    * 获取数据库连接
    * @param {*} dbName 数据库连接
    */
    getConFromConfig(dbName) {
        const realDbName = _resolveDbName(dbName);
        const dbConfig = _config.connections[realDbName];
        if (dbConfig)
            return dbConnector.get(realDbName, dbConfig.ip, dbConfig.port);
        else
            return null;
    }
}

/**
 * 数据库服务
 */
const gameService = {

    /**
     * 根据角色名获取账号ID
     * @param {*} characName 
     * @returns 
     */
    getAccIdByCharacName(characName) {
        const mysql = dbConnector.getConFromConfig('taiwan_cain');
        if (!mysql)
            throw new Error("Database connection is not available.");

        // 从数据库中查询账号ID 
        const safeName = String(characName).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const sql = `select m_id from charac_info where charac_name='%s';`;
        if (!api_MySQL_Exec_Safe(mysql, sql, safeName))
            return null;
        if (!MySQL_Get_N_Rows(mysql))
            return null;
        if (MySQL_Fetch(mysql)) {
            return api_MySQL_Get_Int(mysql, 0);
        }
        return null;
    },
    /**
     * 根据角色名获取角色ID与账号ID
     * @param {string} characName 角色名
     * @returns {{ characNo: number, accId: number } | null}
     */
    getCharacInfoByCharacName(characName) {
        if (!characName)
            return null;
        const mysql = dbConnector.getConFromConfig('taiwan_cain');
        if (!mysql)
            throw new Error("Database connection is not available.");

        const safeName = String(characName).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const sql = `select charac_no, m_id from charac_info where charac_name='%s';`;
        if (!api_MySQL_Exec_Safe(mysql, sql, safeName))
            return null;
        if (!MySQL_Get_N_Rows(mysql))
            return null;
        if (MySQL_Fetch(mysql)) {
            return {
                characNo: api_MySQL_Get_Int(mysql, 0),
                accId: api_MySQL_Get_Int(mysql, 1)
            };
        }
        return null;
    },
    /** 根据角色id查询角色名 */
    getCharacNameByCharacNo(charac_no) {
        const mysql = dbConnector.getConFromConfig('taiwan_cain');
        if (!mysql)
            throw new Error("Database connection is not available.");
        // 从数据库中查询角色名
        const sql = `select charac_name from charac_info where charac_no=%d;`;
        if (!api_MySQL_Exec_Safe(mysql, sql, charac_no))
            return null;
        if (!MySQL_Get_N_Rows(mysql))
            return charac_no.toString();
        if (MySQL_Fetch(mysql)) {
            return api_MySQL_Get_Str(mysql, 0) || charac_no.toString();
        }
        return charac_no.toString();
    }
}

const fridaService = {
    /**
     * 判断是否存在徽章数据
     * @param {*} id 
     * @returns 0代表不存在,存在返回1
     */
    api_Exit_Jewel_Data(id) {
        // 获取连接
        const mysql = dbConnector.getConFromConfig('frida');
        if (!mysql)
            throw new Error("Database connection is not available.");
        const sql = `SELECT andonglishanbai_flag FROM data where equ_id = %d`;
        if (!api_MySQL_Exec_Safe(mysql, sql, id))
            return 0;
        var exit = 0;
        if (MySQL_Get_N_Rows(mysql) == 1) {
            if (MySQL_Fetch(mysql)) {
                exit = api_MySQL_Get_Int(mysql, 0);
            }
        }
        return exit;
    },
    /**
     * 获取徽章数据
     * @param {*} id 装备ID
     * @returns 存在返回徽章数据,不存在返回空字节数据
     */
    api_Get_Jewel_Socket_Data(id) {
        // 获取连接
        const mysql = dbConnector.getConFromConfig('frida');
        if (!mysql)
            throw new Error("Database connection is not available.");

        let v = Memory.alloc(30);
        v.add(0).writeU8(0)
        const sql = `SELECT jewel_data FROM data where equ_id =%d`;
        if (!api_MySQL_Exec_Safe(mysql, sql, id))
            return v;
        if (MySQL_Get_N_Rows(mysql) == 1) {
            if (MySQL_Fetch(mysql)) {
                MySQL_Get_Binary(mysql, 0, v, 30)
            }
        }
        return v;
    },
    /**
     * 插入一条镶嵌记录
     * @param {*} DB_JewelsocketData 
     * @returns 0 插入失败
     */
    api_Insert_Jewel_Socket_Data(DB_JewelsocketData) {
        const mysql = dbConnector.getConFromConfig('frida');
        if (!mysql)
            throw new Error("Database connection is not available.");
        const date = getTimestamp();
        if (api_MySQL_Exec_Safe(mysql, 'INSERT INTO data (andonglishanbai_flag,jewel_data,date) VALUES(1,0x' + DB_JewelsocketData + ',\'' + date + '\');') == 1) {
            api_MySQL_Exec_Safe(mysql, 'SELECT equ_id FROM data where date = \'' + date + '\';')
            if (MySQL_Get_N_Rows(mysql) == 1) {
                if (MySQL_Fetch(mysql)) {
                    return api_MySQL_Get_Int(mysql, 0);
                }
            }
        }
        return 0;
    },
    /**
     * 更新镶嵌数据
     * @param {*} socket_data 镶嵌数据
     * @param {*} id 装备ID
     * @returns 0代表保存失败 成功返回1
     */
    api_Update_Equiment_Socket(socket_data, id) {
        const mysql = dbConnector.getConFromConfig('frida');
        if (!mysql)
            throw new Error("Database connection is not available.");
        if (api_MySQL_Exec_Safe(mysql, 'UPDATE data SET jewel_data = 0x' + socket_data + ' WHERE equ_id = ' + id + ';') == 1) {
            return 1;
        }
        return 0;
    }
}

module.exports = {
    init() {
        // 初始化连接 
        api_ScheduleOnMainThread(_initConnections, null); // 初始化数据库
    },
    dispose() {
        dbConnector.closeAll();
    },
    dbUtils,
    dbConnector,
    gameService,
    fridaService,
    serverGroupDbName: _serverGroupDbName,
    serverGroup: _serverGroup
}
