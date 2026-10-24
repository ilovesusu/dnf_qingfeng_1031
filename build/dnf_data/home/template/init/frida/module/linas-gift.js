/**
* linas-gift.js
* 修复林纳斯礼物掉线
* 20250901 by Tim
* 参考：https://tieba.baidu.com/p/9898605436?fid=2002257&pid=152581017485&cid=0#152581017485
*/

/** 模块配置 */
var _config = {
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;


const Dispatcher_read = new NativeFunction(ptr(0x081db4c4), "int", ["pointer", "pointer", "pointer"], { abi: "sysv" });
const LineFunc = new NativeFunction(ptr(0x085908d7), "int", ["int", "pointer", "int", "uint"], { abi: "sysv" });
const PacketBuf_get_byte = new NativeFunction(ptr(0x0858cf70), "int", ["pointer", "pointer"], { abi: "sysv" });

////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

module.exports = { 
    hooks: [
        {
            address: '0x081db4c4',
            replace(thisPtr, packetBuf, msgBase) {
                const countPtr = msgBase.add(13);
                // 读取计数值
                const getByteResult = PacketBuf_get_byte(packetBuf, countPtr);
                if (getByteResult !== 1) {
                    const msg = Memory.allocUtf8String("virtual int Dispatcher_Select_Item_Grwoth_Power::read(PacketBuf&, MSG_BASE&)");
                    return LineFunc(19029, msg, 0, 0);
                }
                const count = countPtr.readU8();
                // 边界检查
                const MAX_SAFE_COUNT = 5;
                if (count > MAX_SAFE_COUNT) {
                    console.log("count>5,Buffer overflow prevented in Dispatcher_Select_Item_Grwoth_Power::read");
                    const msg = Memory.allocUtf8String("Buffer overflow prevented in Dispatcher_Select_Item_Grwoth_Power::read");
                    return LineFunc(19035, msg, 0, 0);
                }
                // 处理数据
                for (let i = 0; i < count; i++) {
                    const target = msgBase.add(14 + i);
                    const byteResult = PacketBuf_get_byte(packetBuf, target);
                    if (byteResult !== 1) {
                        const msg = Memory.allocUtf8String("virtual int Dispatcher_Select_Item_Grwoth_Power::read(PacketBuf&, MSG_BASE&)");
                        return LineFunc(19034, msg, 0, 0);
                    }
                }
                return 0;
            },
            retType: 'int',
            argTypes: ['pointer', 'pointer', 'pointer'],
        }
    ]
};
