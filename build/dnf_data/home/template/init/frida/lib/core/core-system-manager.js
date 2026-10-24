/**
 * core-system-manager.js
 * 系统管理模块 - 负责GM指令处理等系统级功能(系统核心模块)
 * 20250901 by Tim
 */

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

// --------------- 其他 相关接口 ------------------

/** 获取系统时间 */
var GlobalData_SystemTime = ptr(0x941F714);
/** 获取字符串长度*/
var strlen = new NativeFunction(Module.getExportByName(null, 'strlen'), 'int', ['pointer'], { "abi": "sysv" });

var get_rand_int = new NativeFunction(ptr(0x086B1B87), 'int', ['int'], { "abi": "sysv" });

// --------------- Packet 相关接口 ------------------

/** 服务器组包*/
var PacketGuard_PacketGuard = new NativeFunction(ptr(0x858DD4C), 'int', ['pointer'], { "abi": "sysv" });
/**从客户端封包中读取数据*/
var PacketBuf_Get_Byte = new NativeFunction(ptr(0x858CF22), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var PacketBuf_Get_Short = new NativeFunction(ptr(0x858CFC0), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var PacketBuf_Get_Int = new NativeFunction(ptr(0x858D27E), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var PacketBuf_Get_Binary = new NativeFunction(ptr(0x858D3B2), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });

var InterfacePacketBuf_Put_Header = new NativeFunction(ptr(0x80CB8FC), 'int', ['pointer', 'int', 'int'], { "abi": "sysv" });
var InterfacePacketBuf_Put_Str = new NativeFunction(ptr(0x081B73E4), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
var InterfacePacketBuf_Put_Byte = new NativeFunction(ptr(0x80CB920), 'int', ['pointer', 'uint8'], { "abi": "sysv" });
var InterfacePacketBuf_Put_Short = new NativeFunction(ptr(0x80D9EA4), 'int', ['pointer', 'uint16'], { "abi": "sysv" });
var InterfacePacketBuf_Put_Int = new NativeFunction(ptr(0x80CB93C), 'int', ['pointer', 'int'], { "abi": "sysv" });
var InterfacePacketBuf_Put_Binary = new NativeFunction(ptr(0x811DF08), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
var InterfacePacketBuf_Finalize = new NativeFunction(ptr(0x80CB958), 'int', ['pointer', 'int'], { "abi": "sysv" });
var Destroy_PacketGuard_PacketGuard = new NativeFunction(ptr(0x858DE80), 'int', ['pointer'], { "abi": "sysv" });
var InterfacePacketBuf_Clear = new NativeFunction(ptr(0x080cb8e6), 'int', ['pointer'], { "abi": "sysv" });
var InterfacePacketBuf_Put_Packet = new NativeFunction(ptr(0x0815098e), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var PacketGuard_Free_PacketGuard = new NativeFunction(ptr(0x0858de80), 'void', ['pointer'], { "abi": "sysv" });
var Packet_Monitor_Max_Level_BroadCast_Packet_Monitor_Max_Level_BroadCast = new NativeFunction(ptr(0x08694560), 'void', ['pointer'], { "abi": "sysv" });

// --------------- 线程 相关接口 ------------------

/** 服务器内置定时器队列 */
var G_TimerQueue = new NativeFunction(ptr(0x80F647C), 'pointer', [], { "abi": "sysv" });
/** 线程安全锁 */
var Guard_Mutex_Guard = new NativeFunction(ptr(0x810544C), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var Destroy_Guard_Mutex_Guard = new NativeFunction(ptr(0x8105468), 'int', ['pointer'], { "abi": "sysv" });

/** 阻塞，单位微秒 */
var usleep = new NativeFunction(Module.getExportByName(null, "usleep"), "void", ["uint"]);

////////////////////////////////////////////////////////////////////////
// 变量
////////////////////////////////////////////////////////////////////////

/** 需要在dispatcher线程执行的任务队列(热加载后会被清空) */
var _timer_dispatcher_list = [];

/** 用于保护 _timer_dispatcher_list 的锁相关变量 */
let _dispatcher_list_mutex_guard_obj = null; // 用于 Guard_Mutex_Guard 的第一个参数，作为锁的持有者状态
let _dispatcher_list_lock_target_obj = null;   // 用于 Guard_Mutex_Guard 的第二个参数，代表我们自己的锁对象

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////


/** 申请锁(申请后务必手动释放!!!) */
function api_Guard_Mutex_Guard() {
    var a1 = Memory.alloc(100);
    Guard_Mutex_Guard(a1, G_TimerQueue().add(16));

    return a1;
}

/** 处理到期的自定义定时器 */
function _do_timer_dispatch() {

    // 当前待处理的定时器任务列表
    var task_list = [];

    // 线程安全（使用游戏已初始化的 G_TimerQueue 互斥锁与局部 Guard，避免多线程竞争与内存越界）
    var guard = api_Guard_Mutex_Guard();

    // 依次取出队列中的任务
    while (_timer_dispatcher_list.length > 0) {
        // 先入先出
        var task = _timer_dispatcher_list.shift();
        task_list.push(task);
    }

    // 解锁
    Destroy_Guard_Mutex_Guard(guard);

    // 执行任务
    for (var i = 0; i < task_list.length; ++i) {
        var task = task_list[i];

        var f = task[0];
        var args = task[1];
        try {
            f.apply(null, args);
        } catch (error) {
            log(ERROR, `[${module.name}] Error executing scheduled task on function '${f.name || 'anonymous'}':\n`, error.stack);
        }
    }
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

/** 
 * 日期时间 相关
 */
const time = {
    /** 
     * 获取系统UTC时间(秒)
     * @returns 
     */
    api_CSystemTime_getCurSec() {
        return GlobalData_SystemTime.readInt();
    },
    /** 
     * 本地时间戳(年月日 时分秒)，可指定日期
     * @param {*} date 可传入指定Date
     * @returns 
     */
    getTimestamp(date = null) {
        if (!date)
            date = new Date();
        // date = new Date(date.setHours(date.getHours() + 0));     // 转换到本地时间
        var year = date.getFullYear().toString();
        var month = (date.getMonth() + 1).toString();
        var day = date.getDate().toString();
        var hour = date.getHours().toString();
        var minute = date.getMinutes().toString();
        var second = date.getSeconds().toString();
        var ms = date.getMilliseconds().toString();

        return year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second + '.' + ms;
    },
    /** 
     * 本地时间戳(年月日)
     * @returns 
     */
    getDate() {
        var date = new Date();
        // date = new Date(date.setHours(date.getHours() + 0));     // 转换到本地时间
        var year = date.getFullYear().toString();
        var month = (date.getMonth() + 1).toString();
        var day = date.getDate().toString();

        return year + '-' + month + '-' + day;
    }
}

/** 通用  */
const common = {
    strlen,
    get_rand_int,
    /** 获取区间随机整数 [min, max) */
    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
}

/** Packet 相关 */
const packet = {
    InterfacePacketBuf_Put_Packet,
    InterfacePacketBuf_Put_Header,
    InterfacePacketBuf_Put_Int,
    InterfacePacketBuf_Put_Byte,
    InterfacePacketBuf_Put_Short,
    InterfacePacketBuf_Put_Str,
    InterfacePacketBuf_Put_Binary,
    InterfacePacketBuf_Finalize,
    InterfacePacketBuf_Clear,
    Destroy_PacketGuard_PacketGuard,

    /** 服务器组包*/
    api_PacketGuard_PacketGuard() {
        var packet_guard = Memory.alloc(0x20000);
        PacketGuard_PacketGuard(packet_guard);
        return packet_guard;
    },

    /** 获取原始封包数据*/
    api_PacketBuf_Get_Buf(packet_buf) {
        return packet_buf.add(20).readPointer().add(13);
    },
    /**从客户端封包中读取数据 (失败会抛异常, 调用方必须做异常处理)*/
    api_PacketBuf_Get_Byte(packet_buf) {
        var data = Memory.alloc(1);

        if (PacketBuf_Get_Byte(packet_buf, data)) {
            return data.readU8();
        }
        throw new Error('PacketBuf_Get_Byte Fail!');
    },
    api_PacketBuf_Get_Short(packet_buf) {
        var data = Memory.alloc(2);

        if (PacketBuf_Get_Short(packet_buf, data)) {
            return data.readShort();
        }
        throw new Error('PacketBuf_Get_Short Fail!');
    },
    api_PacketBuf_Get_Int(packet_buf) {
        var data = Memory.alloc(4);

        if (PacketBuf_Get_Int(packet_buf, data)) {
            return data.readInt();
        }
        throw new Error('PacketBuf_Get_Int Fail!');
    },
    api_PacketBuf_Get_Binary(packet_buf, len) {
        var data = Memory.alloc(len);

        if (PacketBuf_Get_Binary(packet_buf, data, len)) {
            return data.readByteArray(len);
        }
        throw new Error('PacketBuf_Get_Binary Fail!');
    },
    /** 发送字符串给客户端*/
    api_InterfacePacketBuf_Put_String(packet_guard, s) {
        var p = Memory.allocUtf8String(s);
        var len = strlen(p);
        InterfacePacketBuf_Put_Int(packet_guard, len);
        InterfacePacketBuf_Put_Binary(packet_guard, p, len);
        return;
    },
}

/** 线程 相关 */
const thread = {
    /** 在dispatcher线程执行(args为函数f的参数组成的数组, 若f无参数args可为null) */
    api_ScheduleOnMainThread(f, args) {
        var guard = api_Guard_Mutex_Guard();
        _timer_dispatcher_list.push([f, args]);
        Destroy_Guard_Mutex_Guard(guard);
        return;
    },
    /** 设置非阻塞定时器 到期后在dispatcher线程执行，返回 timerId 供清理 */
    api_ScheduleOnMainThread_Delay(f, args, delay) {
        return setTimeout(() => {
            thread.api_ScheduleOnMainThread(f, args);
        }, delay);
    },
    /** 取消尚未触发的延迟任务 */
    api_ClearScheduleDelay(timerId) {
        if (timerId !== null && timerId !== undefined) {
            clearTimeout(timerId);
        }
    }
}

module.exports = {
    // 业务接口,供 context 使用
    init() {
        _dispatcher_list_mutex_guard_obj = Memory.alloc(100); // 用于 Guard_Mutex_Guard 的第一个参数，作为锁的持有者状态
        _dispatcher_list_lock_target_obj = Memory.alloc(4);   // 用于 Guard_Mutex_Guard 的第二个参数，代表我们自己的锁对象
    },
    api: {
        time,
        common,
        packet,
        thread,
    },
    hooks: [
        // 服务器内置定时器 每秒至少执行一次
        {
            address: '0x8632A18',
            onEnter(args) {

            },
            onLeave(retval) {
                // 清空等待执行的任务队列
                _do_timer_dispatch();
            }
        }
    ],
};
