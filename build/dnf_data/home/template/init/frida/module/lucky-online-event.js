/**
 * lucky-online-event.js
 * 整点在线幸运玩家抽奖活动
 * 功能：每逢整点从频道内所有已登录角色（state >= 3）中等概率随机抽取 1 名幸运玩家，发放道具与点券奖励并全服公告。
 */

var _config = {
    offsetSec: 3,                       // 整点过后延迟多少秒开奖（默认整点过 3 秒）
    rewardItemsList: [
        [3037, 88],                     // 无色小晶块 x88
        [8, 8],                         // 复活币礼盒/消耗品 x8
    ],
    rewardCashCera: 66,                 // 幸运玩家点券奖励
};

let _timerId = null;

function _scheduleNextDraw() {
    const curTime = context.system.time.api_CSystemTime_getCurSec();
    const delaySec = 3600 - (curTime % 3600) + _config.offsetSec;
    context.system.thread.api_ClearScheduleDelay(_timerId);
    _timerId = context.system.thread.api_ScheduleOnMainThread_Delay(_onDrawLuckyUser, null, delaySec * 1000);
}

function _onDrawLuckyUser() {
    _timerId = null;
    try {
        const cuser = context.utils.cuser;
        const cinfo = context.utils.cuserCharacInfo;
        const citem = context.utils.citem;
        const gameWorld = context.utils.gameWorld;

        // 收集所有 state >= 3 的在线角色，确保整点抽奖100%命中有效在线玩家（修复原版落到选角界面玩家导致本轮流局的问题）
        const candidates = [];
        gameWorld.api_GameWorld_Foreach((user) => {
            if (user && !user.isNull() && cuser.CUser_Get_State(user) >= 3) {
                candidates.push(user);
            }
        }, null);

        if (candidates.length > 0) {
            const idx = context.system.common.getRandomInt(0, candidates.length);
            const luckyUser = candidates[idx];
            let rewardMsg = '';

            if (Array.isArray(_config.rewardItemsList) && _config.rewardItemsList.length > 0) {
                for (let i = 0; i < _config.rewardItemsList.length; i++) {
                    const [itemId, itemCnt] = _config.rewardItemsList[i];
                    cuser.api_CUser_AddItem(luckyUser, itemId, itemCnt);
                    rewardMsg += `${citem.api_CItem_GetItemName(itemId)}*${itemCnt}\n`;
                }
            }

            if (_config.rewardCashCera > 0) {
                cuser.api_Recharge_Cash_Cera(luckyUser, _config.rewardCashCera);
                rewardMsg += `${_config.rewardCashCera} 点券`;
            }

            const luckyName = cinfo.api_CUserCharacInfo_GetCurCharacName(luckyUser);
            gameWorld.api_GameWorld_SendNotiPacketMessage(
                `<幸运在线玩家活动>开奖:\n恭喜 [${luckyName}] 成为本轮活动幸运玩家, 已发送奖励:\n${rewardMsg}`,
                0
            );
        }
    } finally {
        _scheduleNextDraw();
    }
}

module.exports = {
    init() {
        _scheduleNextDraw();
    },
    dispose() {
        context.system?.thread?.api_ClearScheduleDelay(_timerId);
        _timerId = null;
    }
};
