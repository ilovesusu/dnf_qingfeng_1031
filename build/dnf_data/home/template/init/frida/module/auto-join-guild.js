/**
 * auto-join-guild.js
 * 自动加入公会
 * 20250927 by Tim
 */

/** 模块配置 */
var _config = {
    gmAuth: context.config.gmCid // GM权限ID，用于权限验证（全局配置文件'frida_config.json'中设置）
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const { api_ScheduleOnMainThread, api_ScheduleOnMainThread_Delay } = context.system.thread;

const { MySQL_Get_N_Rows, api_MySQL_Exec_Safe } = context.mysql.dbUtils;

const { getConFromConfig } = context.mysql.dbConnector;

////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

function _init() {
    const mysql = getConFromConfig('taiwan_cain');
    if (!mysql)
        return;
    const sgDb = (context.mysql.serverGroupDbName || 'taiwan_cain').replace(/[^A-Za-z0-9_]/g, '');
    const serverId = parseInt(context.mysql.serverGroup || '3', 10) || 3;
    // 自动加入公会，只有存在公会（公会id=1）才会在建角色的时候加入 
    if (api_MySQL_Exec_Safe(mysql, `SELECT 1 FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = '${sgDb}' AND TRIGGER_NAME = 'auto_join';`)) {
        var result = MySQL_Get_N_Rows(mysql);
        if (result <= 0) {
            var sss = api_MySQL_Exec_Safe(mysql, `CREATE TRIGGER auto_join AFTER INSERT ON charac_stat
                            FOR EACH ROW BEGIN
                            DECLARE v_m_id INT;
                            DECLARE v_charac_no INT;
                            DECLARE v_charac_name VARCHAR(255);
                            DECLARE v_lev INT;
                            DECLARE v_job INT;
                            DECLARE v_grow_type INT;
                            DECLARE v_current_time DATETIME;
                            -- 检查 guid_info 表是否有数据
                                IF EXISTS (SELECT 1 FROM d_guild.guild_info where guild_id = 1) THEN
                                    -- 更新 charac_info 表的 guild_id 和 guild_right
                                    UPDATE \`${sgDb}\`.charac_info
                                    SET guild_id = 1, guild_right = 1
                                    WHERE charac_no = NEW.charac_no;

                                    -- 获取新插入的角色信息
                                    SELECT m_id, charac_no, charac_name, lev, job, grow_type, NOW() 
                                    INTO v_m_id, v_charac_no, v_charac_name, v_lev, v_job, v_grow_type, v_current_time
                                    FROM \`${sgDb}\`.charac_info
                                    WHERE charac_no = NEW.charac_no;

                                    -- 插入新成员到 guild_member 表
                                    INSERT INTO d_guild.guild_member
                                    (guild_id, m_id, server_id, charac_no, charac_name, memo, grade, job, grow_type, lev, member_time, member_flag, last_play_time, age, born_year)
                                    VALUES
                                    (1, v_m_id, ${serverId}, v_charac_no, v_charac_name, 'Tender Feelings', 3, v_job, v_grow_type, v_lev, v_current_time, 1, v_current_time, 0, '00');

                                    -- 更新 guild_info 表的 member_count
                                    UPDATE d_guild.guild_info
                                    SET member_count = member_count + 1
                                    WHERE guild_id = 1;
                                END IF;
                            END`);
        }
    }
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

//module.name 获取模块名
module.exports = {
    init() {
        api_ScheduleOnMainThread_Delay(_init, null, 100);
    },
};
