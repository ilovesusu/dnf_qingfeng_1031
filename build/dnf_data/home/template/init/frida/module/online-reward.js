/**
 * online-reward.js
 * 在线泡点奖励系统
 * 功能：挂载 CUser::WorkPerFiveMin，在线每 5 分钟按累计在线时长阶梯发放点券奖励（越泡越多）。
 */

var _config = {
    ceraPerMinute: 3,           // 每在线 1 分钟对应的点券倍率
    minOnlineMinutes: 1,        // 至少在线多少分钟开始发奖
    maxOnlineDays: 999999,      // 最大累计天数上限
    maxRewardPerTick: 999999,   // 单次发放点券上限保护
};

function _formatTimestamp() {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

module.exports = {
    hooks: [
        // CUser::WorkPerFiveMin (0x08652F0C)
        {
            address: '0x08652F0C',
            onEnter(args) {
                const user = args[0];
                if (!user || user.isNull())
                    return;

                const curTime = context.system.time.api_CSystemTime_getCurSec();
                const loginTick = context.utils.cuserCharacInfo.CUserCharacInfo_GetLoginTick(user);
                if (loginTick <= 0)
                    return;

                const diffMinutes = Math.floor((curTime - loginTick) / 60);
                if (diffMinutes < _config.minOnlineMinutes || diffMinutes > _config.maxOnlineDays * 24 * 60)
                    return;

                const rewardCera = Math.min(_config.maxRewardPerTick, Math.floor(diffMinutes * _config.ceraPerMinute));
                if (rewardCera <= 0)
                    return;

                context.utils.cuser.api_Recharge_Cash_Cera(user, rewardCera);
                context.utils.cuser.api_CUser_SendNotiPacketMessage(
                    user,
                    `[♬点券发送咯！♬  ${_formatTimestamp()}]\n 越泡越多！总在线分钟x${_config.ceraPerMinute}点券!(5分钟计算一次)\n (当前阶段点券奖励:【${rewardCera}】点券！狂欢起来吧！)`,
                    6
                );
            }
        }
    ]
};
