/**
 * epic-potion.js
 * 史诗药剂（2600010）单人深渊爆率加成
 * 功能：单人挑战深渊派对且角色处于史诗药剂（道具 2600010）冷却Buff生效期间，翻倍提升深渊稀有度判定 Roll 值。
 */

var _config = {
    potionItemId: 2600010,              // 史诗药剂道具 ID
    defaultBonusOdds: 1.0,              // 默认爆率加成倍率（1.0 = Roll 值增加 100%，即双倍权重）
    vipCharacOdds: {                    // 可选特殊角色独立倍率配置: characNo -> odds
        // 100000: 1.5
    }
};

// CMonsterDrop_Hell::generateSpecificItem 调用 CLuckPoint::GetItemRarity 后的返回地址
const HELL_DROP_RETURN_ADDR = ptr(0x0853583A);
const CLuckPoint_GetItemRarity_Orig = new NativeFunction(ptr(0x08550BE4), 'int', ['pointer', 'pointer', 'int', 'int'], { "abi": "sysv" });

let _currentDropUser = null;

module.exports = {
    dispose() {
        _currentDropUser = null;
    },
    hooks: [
        // DisPatcher_DieMob::dispatch_sig (0x081EB0C4)
        {
            address: '0x081EB0C4',
            onEnter(args) {
                _currentDropUser = args[1];
            },
            onLeave(retval) {
                _currentDropUser = null;
            }
        },
        // CParty::SetPlayResult (0x085B2412)
        {
            address: '0x085B2412',
            onEnter(args) {
                _currentDropUser = args[1];
            },
            onLeave(retval) {
                _currentDropUser = null;
            }
        },
        // CLuckPoint::GetItemRarity (0x08550BE4)
        {
            address: '0x08550BE4',
            replace(a1, a2, roll, a4) {
                if (!_currentDropUser || _currentDropUser.isNull()) {
                    return CLuckPoint_GetItemRarity_Orig(a1, a2, roll, a4);
                }

                const cuser = context.utils.cuser;
                const party = cuser.CUser_GetParty(_currentDropUser);

                // 修复原版 QuickJS 下 NativePointer 直接用 == 比较恒为 false 的 Bug，改用 .equals()
                if (
                    this.returnAddress &&
                    this.returnAddress.equals(HELL_DROP_RETURN_ADDR) &&
                    cuser.CUser_CheckCoolTimeItem(_currentDropUser, _config.potionItemId) &&
                    context.utils.cparty.api_GetPartyMemberNumber(party) === 1
                ) {
                    const maxRoll = a2.add(16).readU32();
                    const characNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(_currentDropUser);
                    const odds = Object.prototype.hasOwnProperty.call(_config.vipCharacOdds, characNo)
                        ? _config.vipCharacOdds[characNo]
                        : _config.defaultBonusOdds;
                    const boostedRoll = Math.floor(Math.min(roll + roll * odds, maxRoll));
                    return CLuckPoint_GetItemRarity_Orig(a1, a2, boostedRoll, a4);
                }

                return CLuckPoint_GetItemRarity_Orig(a1, a2, roll, a4);
            },
            retType: 'int',
            argTypes: ['pointer', 'pointer', 'int', 'int']
        }
    ]
};
