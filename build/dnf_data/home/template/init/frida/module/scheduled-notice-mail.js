/**
 * scheduled-notice-mail.js
 * 每日定点全服邮件发奖 & 定时轮播系统公告
 * 功能：
 *  1. 每隔指定秒数在主线程轮播全服随机玩法公告；
 *  2. 每日在预设时间点（如 21:10、22:10、23:10）向频道内全部在线玩家发送多附件系统福利邮件。
 */

var _config = {
    enableNoticeCarousel: true,         // 是否启用定时轮播公告
    noticeIntervalMs: 30000,            // 轮播公告间隔（毫秒，默认 30 秒）
    noticeMessages: [
        '<公告>\n【本服属于纯爆装版本】\n无需套娃做装备，本服装备都可通过深渊掉落！\n人人平等，全靠运气！下一个欧皇可能就是你！',
        '<公告>\n本服的装备很多，当勇士们陷入迷茫的时候，不如打开装备词典看看，是否有自己需要的装备，装备词典中完整的记录了所有装备的产出方式',
        '<公告>\n本服属于副本阶段性玩法：\n切记每个阶段都需要达到一定的抗魔值才能进入哦。越高级的副本，掉落的装备越好哦！',
        '<公告>\n抉择之沼大概率掉落史诗装备，大佬们每天千万不要忘记去刷哦',
        '<公告>\n针对细节帝，可以完成称号簿成就任务\n可以获得超高额外属性！',
        '<公告>\n角色初始化技能后,SP/TP点数会通过邮件形式返还给玩家，玩家可以放心初始化技能。',
    ],

    enableScheduledMail: true,          // 是否启用每日定点全服福利邮件
    mailSender: 'GM福利邮件',
    mailContent: '感谢各位勇士在线支持，这是本时段全服定点在线福利，请注意查收！',
    mailSchedules: [
        {
            hour: 21,
            minute: 10,
            second: 0,
            gold: 0,
            items: [
                [3036, 20],
                [1, 20],
            ]
        },
        {
            hour: 22,
            minute: 10,
            second: 0,
            gold: 0,
            items: [
                [3036, 20],
                [3037, 50],
            ]
        },
        {
            hour: 23,
            minute: 10,
            second: 0,
            gold: 0,
            items: [
                [3036, 20],
                [3330, 10],
            ]
        },
    ]
};

const { log } = context.main;
const { INFO } = context.main.LOG_LEVELS;

let _noticeTimerId = null;
const _mailTimerMap = new Map();

function _scheduleNextNotice() {
    if (!_config.enableNoticeCarousel || !Array.isArray(_config.noticeMessages) || _config.noticeMessages.length === 0)
        return;

    context.system.thread.api_ClearScheduleDelay(_noticeTimerId);
    _noticeTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(() => {
        _noticeTimerId = null;
        const idx = context.system.common.getRandomInt(0, _config.noticeMessages.length);
        context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage(_config.noticeMessages[idx], 0);
        _scheduleNextNotice();
    }, null, _config.noticeIntervalMs);
}

function _scheduleMailTask(index, entry) {
    const now = new Date();
    const target = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        entry.hour,
        entry.minute,
        entry.second || 0
    );
    if (now.getTime() >= target.getTime()) {
        target.setDate(target.getDate() + 1);
    }
    const diffMs = Math.max(1000, target.getTime() - now.getTime());

    const prevId = _mailTimerMap.get(index);
    if (prevId !== undefined) {
        context.system.thread.api_ClearScheduleDelay(prevId);
    }

    const timerId = context.system.thread.api_ScheduleOnMainThread_Delay(() => {
        _mailTimerMap.delete(index);
        try {
            const sender = entry.sender || _config.mailSender;
            const content = entry.content || _config.mailContent;
            const gold = entry.gold || 0;
            const items = Array.isArray(entry.items) ? entry.items : [];
            context.utils.gameWorldEx.api_GameWorld_SendMail(sender, content, gold, items);
            context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage(
                `<全服福利> ${String(entry.hour).padStart(2, '0')}:${String(entry.minute).padStart(2, '0')} 全服定点福利邮件已发放，请在线勇士查收邮箱！`,
                14
            );
            log(INFO, `[${module.name}] Sent scheduled server mail #${index} (${entry.hour}:${entry.minute}).`);
        } finally {
            _scheduleMailTask(index, entry);
        }
    }, null, diffMs);

    _mailTimerMap.set(index, timerId);
}

module.exports = {
    init() {
        _scheduleNextNotice();
        if (_config.enableScheduledMail && Array.isArray(_config.mailSchedules)) {
            _config.mailSchedules.forEach((entry, idx) => {
                _scheduleMailTask(idx, entry);
            });
        }
    },
    dispose() {
        if (context.system?.thread) {
            context.system.thread.api_ClearScheduleDelay(_noticeTimerId);
            for (const timerId of _mailTimerMap.values()) {
                context.system.thread.api_ClearScheduleDelay(timerId);
            }
        }
        _noticeTimerId = null;
        _mailTimerMap.clear();
    }
};
