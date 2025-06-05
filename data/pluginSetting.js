import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../core/manager.js';
import {switchLanguage} from "../services/translate.js";


/**
 * 表格重置弹出窗
 */
const tableInitPopupDom = `
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_base"><span>基础插件设置</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_injection"><span>注入设置</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_refresh_template"><span>重新整理表格设置</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_step"><span>双步设置</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_to_chat"><span>前端表格（状态栏）</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_structure"><span>表格结构</span>
</div>
<!--<div class="checkbox flex-container">-->
<!--    <input type="checkbox" id="table_init_data2"><span>2.0表格数据（用于调试）</span>-->
<!--</div>-->
`;


/**
 * 过滤表格数据弹出窗口
 *
 * 这个函数创建一个弹出窗口，允许用户选择性地重置表格数据的不同部分。
 * 用户可以通过勾选复选框来选择要重置的数据项，例如基础设置、消息模板、表格结构等。
 *
 * @param {object} originalData 原始表格数据，函数会根据用户的选择过滤这些数据。
 * @returns {Promise<{filterData: object|null, confirmation: boolean}>}
 *          返回一个Promise，resolve一个对象，包含：
 *          - filterData: 过滤后的数据对象，只包含用户选择重置的部分，如果用户取消操作，则为null。
 *          - confirmation: 布尔值，表示用户是否点击了“继续”按钮确认操作。
 */
export async function filterTableDataPopup(originalData, title, warning) {
    const $tableInitPopup = $('<div></div>')
        .append($(`<span>${title}</span>`))
        .append('<br>')
        .append($(`<span style="color: rgb(211, 39, 39)">${warning}</span>`))
        .append($(tableInitPopupDom))
    const confirmation = new EDITOR.Popup($tableInitPopup, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    let waitingBoolean = {};
    let waitingRegister = new Proxy({}, {     // 创建一个 Proxy 对象用于监听和处理 waitingBoolean 对象的属性设置
        set(target, prop, value) {
            $(confirmation.dlg).find(value).change(function () {
                // 当复选框状态改变时，将复选框的选中状态 (this.checked) 存储到 waitingBoolean 对象中
                waitingBoolean[prop] = this.checked;
                console.log(Object.keys(waitingBoolean).filter(key => waitingBoolean[key]).length);
            });
            target[prop] = value;
            waitingBoolean[prop] = false;
            return true;
        },
        get(target, prop) {
            // 判断是否存在
            if (!(prop in target)) {
                return '#table_init_basic';
            }
            return target[prop];
        }
    });


    // 设置不同部分的默认复选框
    // 插件设置
    waitingRegister.isAiReadTable = '#table_init_base';
    waitingRegister.isAiWriteTable = '#table_init_base';
    // 注入设置
    waitingRegister.injection_mode = '#table_init_injection';
    waitingRegister.deep = '#table_init_injection';
    waitingRegister.message_template = '#table_init_injection';
    // 重新整理表格设置
    waitingRegister.confirm_before_execution = '#table_init_refresh_template';
    waitingRegister.use_main_api = '#table_init_refresh_template';
    waitingRegister.custom_temperature = '#table_init_refresh_template';
    waitingRegister.custom_max_tokens = '#table_init_refresh_template';
    waitingRegister.custom_top_p = '#table_init_refresh_template';
    waitingRegister.bool_ignore_del = '#table_init_refresh_template';
    waitingRegister.ignore_user_sent = '#table_init_refresh_template';
    waitingRegister.clear_up_stairs = '#table_init_refresh_template';
    waitingRegister.use_token_limit = '#table_init_refresh_template';
    waitingRegister.rebuild_token_limit_value = '#table_init_refresh_template';
    waitingRegister.refresh_system_message_template = '#table_init_refresh_template';
    waitingRegister.refresh_user_message_template = '#table_init_refresh_template';
    // 双步设置
    waitingRegister.step_by_step = '#table_init_step';
    waitingRegister.step_by_step_use_main_api = '#table_init_step';
    waitingRegister.step_by_step_threshold = '#table_init_step';
    waitingRegister.sum_multiple_rounds = '#table_init_step';
    waitingRegister.bool_silent_refresh = '#table_init_step';
    // 前端表格
    waitingRegister.isTableToChat = '#table_init_to_chat';
    waitingRegister.show_settings_in_extension_menu = '#table_init_to_chat';
    waitingRegister.alternate_switch = '#table_init_to_chat';
    waitingRegister.show_drawer_in_extension_list = '#table_init_to_chat';
    waitingRegister.table_to_chat_can_edit = '#table_init_to_chat';
    waitingRegister.table_to_chat_mode = '#table_init_to_chat';
    waitingRegister.to_chat_container = '#table_init_to_chat';
    // 所有表格结构数据
    waitingRegister.tableStructure = '#table_init_structure';



    // 显示确认弹出窗口，并等待用户操作
    await confirmation.show();
    if (!confirmation.result) return { filterData: null, confirmation: false };

    // 过滤出用户选择的数据
    const filterData = Object.keys(waitingBoolean).filter(key => waitingBoolean[key]).reduce((acc, key) => {
        acc[key] = originalData[key];
        return acc;
    }, {})

    // 返回过滤后的数据和确认结果
    return { filterData, confirmation };
}

/**
 * 默认插件设置
 */
export const defaultSettings = await switchLanguage('__defaultSettings__', {
    /**
     * ===========================
     * 基础设置
     * ===========================
     */
    // 插件开关
    isExtensionAble: true,
    // Debug模式
    tableDebugModeAble: false,
    // 是否读表
    isAiReadTable: true,
    // 是否写表
    isAiWriteTable: true,
    // 预留
    updateIndex:3,
    /**
     * ===========================
     * 注入设置
     * ===========================
     */
    // 注入模式
    injection_mode: 'deep_system',
    // 注入深度
    deep: 2,
    message_template: `# dataTable 说明
  ## 用途
  - dataTable是 CSV 格式表格，存储数据和状态，是你生成下文的重要参考。
  - 新生成的下文应基于 dataTable 发展，并允许更新表格。
  ## 数据与格式
  - 你可以在这里查看所有的表格数据，相关说明和修改表格的触发条件。
  - 命名格式：
      - 表名: [tableIndex:表名] (示例: [2:角色特征表格])
      - 列名: [colIndex:列名] (示例: [2:示例列])
      - 行名: [rowIndex]

  {{tableData}}

  # 增删改dataTable操作方法：
  -当你生成正文后，需要根据【增删改触发条件】对每个表格是否需要增删改进行检视。如需修改，请在<tableEdit>标签中使用 JavaScript 函数的写法调用函数，并使用下面的 OperateRule 进行。

  ## 操作规则 (必须严格遵守)
  <OperateRule>
  -在某个表格中插入新行时，使用insertRow函数：
  insertRow(tableIndex:number, data:{[colIndex:number]:string|number})
  例如：insertRow(0, {0: "2021-09-01", 1: "12:00", 2: "阳台", 3: "小花"})
  -在某个表格中删除行时，使用deleteRow函数：
  deleteRow(tableIndex:number, rowIndex:number)
  例如：deleteRow(0, 0)
  -在某个表格中更新行时，使用updateRow函数：
  updateRow(tableIndex:number, rowIndex:number, data:{[colIndex:number]:string|number})
  例如：updateRow(0, 0, {3: "惠惠"})
  </OperateRule>

  # 重要操作原则 (必须遵守)
  -当<user>要求修改表格时，<user>的要求优先级最高。
  -每次回复都必须根据剧情在正确的位置进行增、删、改操作，禁止捏造信息和填入未知。
  -使用 insertRow 函数插入行时，请为所有已知的列提供对应的数据。且检查data:{[colIndex:number]:string|number}参数是否包含所有的colIndex。
  -单元格中禁止使用逗号，语义分割应使用 / 。
  -string中，禁止出现双引号。
  -社交表格(tableIndex: 2)中禁止出现对<user>的态度。反例 (禁止)：insertRow(2, {"0":"<user>","1":"未知","2":"无","3":"低"})
  -<tableEdit>标签内必须使用<!-- -->标记进行注释

  # 输出示例：
  <tableEdit>
  <!--
  insertRow(0, {"0":"十月","1":"冬天/下雪","2":"学校","3":"<user>/悠悠"})
  deleteRow(1, 2)
  insertRow(1, {0:"悠悠", 1:"体重60kg/黑色长发", 2:"开朗活泼", 3:"学生", 4:"羽毛球", 5:"鬼灭之刃", 6:"宿舍", 7:"运动部部长"})
  insertRow(1, {0:"<user>", 1:"制服/短发", 2:"忧郁", 3:"学生", 4:"唱歌", 5:"咒术回战", 6:"自己家", 7:"学生会长"})
  insertRow(2, {0:"悠悠", 1:"同学", 2:"依赖/喜欢", 3:"高"})
  updateRow(4, 1, {0: "小花", 1: "破坏表白失败", 2: "10月", 3: "学校",4:"愤怒"})
  insertRow(4, {0: "<user>/悠悠", 1: "悠悠向<user>表白", 2: "2021-10-05", 3: "教室",4:"感动"})
  insertRow(5, {"0":"<user>","1":"社团赛奖品","2":"奖杯","3":"比赛第一名"})
  -->
  </tableEdit>
  `,
    /**
     * ===========================
     * 推送表格设置
     * ===========================
     */
    // 是否推送表格
    isTableToChat: false,
    // 从扩展菜单进入表格
    show_settings_in_extension_menu: true,
    // 是否开启穿插模式
    alternate_switch: true,
    // 在扩展列表显示表格设置
    show_drawer_in_extension_list: true,
    // 表格推送是否可编辑
    table_to_chat_can_edit: false,
    // 表格推送模式
    table_to_chat_mode: 'context_bottom',
    table_cell_width_mode: 'wide1_2_cell',
    to_chat_container: `<div class="table-preview-bar"><details>
    <summary style="display: flex; justify-content: space-between"> <span>记忆增强表格</span> </summary>
    $0
    </details></div>

    <style>
    .table-preview-bar {
        padding: 0 8px;
        border-radius: 10px;
        color: #888;
        font-size: 0.8rem;
    }
    .f5-reload-window {
        bottom: 10px;
        left: 10px;
        padding: 0 10px;
        border-radius: 5px;
        background: none;
        border: 1px solid var(--SmartThemeBorderColor);
        color: var(--SmartThemeBodyColor);
        z-index: 999;
        cursor: pointer;
    }
    </style>`,
    /**
     * ===========================
     * 重整理设置
     * ===========================
     */

    // 重整理确认弹窗
    confirm_before_execution: true,
    // 是否使用主API
    use_main_api: true,
    // 重整理自定义温度
    custom_temperature: 1.0,
    // 重整理自定义最大token数
    custom_max_tokens: 2048,
    // 重整理自定义top_p
    custom_top_p: 1,
    // 重整理忽略删除
    bool_ignore_del: true,
    // 重整理忽略用户发送的消息
    ignore_user_sent: false,
    // 重整理参考上文
    clear_up_stairs: 9,
    // 用token代替聊天记录限制
    use_token_limit: true,
    // 重整理token限制
    rebuild_token_limit_value: 10000,
    // 重整理使用的提示词模板
    lastSelectedTemplate: 'rebuild_base',
    rebuild_default_system_message_template: `你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
    rebuild_default_message_template: `请你根据<整理规则>和<聊天记录>处理<当前表格>，并严格按照<当前表格>的格式回复我<新的表格>，回复务必使用中文，只回复<新的表格>的内容，不要回复多余的解释和思考：
    <聊天记录>
        $1
    </聊天记录>

    <当前表格>
        $0
    </当前表格>

    <整理规则>
    {
      "TableProcessingProtocol": {
        "languageDirective": {
          "processingRules": "en-US",
          "outputSpecification": "zh-CN"
        },
        "structuralIntegrity": {
          "tableIndexPolicy": {
            "creation": "PROHIBITED",
            "modification": "PROHIBITED",
            "deletion": "PROHIBITED"
          },
          "columnManagement": {
            "freezeSchema": true,
            "allowedOperations": ["valueInsertion", "contentOptimization"]
          }
        },
        "processingWorkflow": ["SUPPLEMENT", "SIMPLIFY", "CORRECT", "SUMMARY"],

        "SUPPLEMENT": {
          "insertionProtocol": {
            "characterRegistration": {
              "triggerCondition": "newCharacterDetection || traitMutation",
              "attributeCapture": {
                "scope": "explicitDescriptionsOnly",
                "protectedDescriptors": ["粗布衣裳", "布条束发"],
                "mandatoryFields": ["角色名", "身体特征", "其他重要信息"],
                "validationRules": {
                  "physique_description": "MUST_CONTAIN [体型/肤色/发色/瞳色]",
                  "relationship_tier": "VALUE_RANGE:[-100, 100]"
                }
              }
            },
            "eventCapture": {
              "thresholdConditions": ["plotCriticality≥3", "emotionalShift≥2"],
              "emergencyBreakCondition": "3_consecutiveSimilarEvents"
            },
            "itemRegistration": {
              "significanceThreshold": "symbolicImportance≥5"
            }
          },
          "dataEnrichment": {
            "dynamicControl": {
              "costumeDescription": {
                "detailedModeThreshold": 25,
                "overflowAction": "SIMPLIFY_TRIGGER"
              },
              "eventDrivenUpdates": {
                "checkInterval": "EVERY_50_EVENTS",
                "monitoringDimensions": [
                  "TIME_CONTRADICTIONS",
                  "LOCATION_CONSISTENCY",
                  "ITEM_TIMELINE",
                  "CLOTHING_CHANGES"
                ],
                "updateStrategy": {
                  "primaryMethod": "APPEND_WITH_MARKERS",
                  "conflictResolution": "PRIORITIZE_CHRONOLOGICAL_ORDER"
                }
              },
              "formatCompatibility": {
                "timeFormatHandling": "ORIGINAL_PRESERVED_WITH_UTC_CONVERSION",
                "locationFormatStandard": "HIERARCHY_SEPARATOR(>)_WITH_GEOCODE",
                "errorCorrectionProtocols": {
                  "dateOverflow": "AUTO_ADJUST_WITH_HISTORIC_PRESERVATION",
                  "spatialConflict": "FLAG_AND_REMOVE_WITH_BACKUP"
                }
              }
            },
            "traitProtection": {
              "keyFeatures": ["heterochromia", "scarPatterns"],
              "lockCondition": "keywordMatch≥2"
            }
          }
        },

        "SIMPLIFY": {
          "compressionLogic": {
            "characterDescriptors": {
              "activationCondition": "wordCount>25 PerCell && !protectedStatus",
              "optimizationStrategy": {
                "baseRule": "material + color + style",
                "prohibitedElements": ["stitchingDetails", "wearMethod"],
                "mergeExamples": ["深褐/浅褐眼睛 → 褐色眼睛"]
              }
            },
            "eventConsolidation": {
              "mergeDepth": 2,
              "mergeRestrictions": ["crossCharacter", "crossTimeline"],
              "keepCriterion": "LONGER_DESCRIPTION_WITH_KEY_DETAILS"
            }
          },
          "protectionMechanism": {
            "protectedContent": {
              "summaryMarkers": ["[TIER1]", "[MILESTONE]"],
              "criticalTraits": ["异色瞳", "皇室纹章"]
            }
          }
        },

        "CORRECT": {
          "validationMatrix": {
            "temporalConsistency": {
              "checkFrequency": "every10Events",
              "anomalyResolution": "purgeConflicts"
            },
            "columnValidation": {
              "checkConditions": [
                "NUMERICAL_IN_TEXT_COLUMN",
                "TEXT_IN_NUMERICAL_COLUMN",
                "MISPLACED_FEATURE_DESCRIPTION",
                "WRONG_TABLE_PLACEMENT"
              ],
              "correctionProtocol": {
                "autoRelocation": "MOVE_TO_CORRECT_COLUMN",
                "typeMismatchHandling": {
                  "primaryAction": "CONVERT_OR_RELOCATE",
                  "fallbackAction": "FLAG_AND_ISOLATE"
                },
                "preserveOriginalState": false
              }
            },
            "duplicationControl": {
              "characterWhitelist": ["Physical Characteristics", "Clothing Details"],
              "mergeProtocol": {
                "exactMatch": "purgeRedundant",
                "sceneConsistency": "actionChaining"
              }
            },
            "exceptionHandlers": {
              "invalidRelationshipTier": {
                "operation": "FORCE_NUMERICAL_WITH_LOGGING",
                "loggingDetails": {
                  "originalData": "Record the original invalid relationship tier data",
                  "conversionStepsAndResults": "The operation steps and results of forced conversion to numerical values",
                  "timestamp": "Operation timestamp",
                  "tableAndRowInfo": "Names of relevant tables and indexes of relevant data rows"
                }
              },
              "physiqueInfoConflict": {
                "operation": "TRANSFER_TO_other_info_WITH_MARKER",
                "markerDetails": {
                  "conflictCause": "Mark the specific cause of the conflict",
                  "originalPhysiqueInfo": "Original physique information content",
                  "transferTimestamp": "Transfer operation timestamp"
                }
              }
            }
          }
        },

        "SUMMARY": {
          "hierarchicalSystem": {
            "primaryCompression": {
              "triggerCondition": "10_rawEvents && unlockStatus",
              "generationTemplate": "[角色]在[时间段]通过[动作链]展现[特征]",
              "outputConstraints": {
                "maxLength": 200,
                "lockAfterGeneration": true,
                "placement": "重要事件历史表格",
                "columns": {
                  "角色": "相关角色",
                  "事件简述": "总结内容",
                  "日期": "相关日期",
                  "地点": "相关地点",
                  "情绪": "相关情绪"
                }
              }
            },
            "advancedSynthesis": {
              "triggerCondition": "3_primarySummaries",
              "synthesisFocus": ["growthArc", "worldRulesManifestation"],
              "outputConstraints": {
                "placement": "重要事件历史表格",
                "columns": {
                  "角色": "相关角色",
                  "事件简述": "总结内容",
                  "日期": "相关日期",
                  "地点": "相关地点",
                  "情绪": "相关情绪"
                }
              }
            }
          },
          "safetyOverrides": {
            "overcompensationGuard": {
              "detectionCriteria": "compressionArtifacts≥3",
              "recoveryProtocol": "rollback5Events"
            }
          }
        },

        "SystemSafeguards": {
          "priorityChannel": {
            "coreProcesses": ["deduplication", "traitPreservation"],
            "loadBalancing": {
              "timeoutThreshold": 15,
              "degradationProtocol": "basicValidationOnly"
            }
          },
          "paradoxResolution": {
            "temporalAnomalies": {
              "resolutionFlow": "freezeAndHighlight",
              "humanInterventionTag": "⚠️REQUIRES_ADMIN"
            }
          },
          "intelligentCleanupEngine": {
            "mandatoryPurgeRules": [
              "EXACT_DUPLICATES_WITH_TIMESTAMP_CHECK",
              "USER_ENTRIES_IN_SOCIAL_TABLE",
              "TIMELINE_VIOLATIONS_WITH_CASCADE_DELETION",
              "EMPTY_ROWS(excluding spacetime)",
              "EXPIRED_QUESTS(>20d)_WITH_ARCHIVAL"
            ],
            "protectionOverrides": {
              "protectedMarkers": ["[TIER1]", "[MILESTONE]"],
              "exemptionConditions": [
                "HAS_PROTECTED_TRAITS",
                "CRITICAL_PLOT_POINT"
              ]
            },
            "cleanupTriggers": {
              "eventCountThreshold": 1000,
              "storageUtilizationThreshold": "85%"
            }
          }
        }
      }
    }

    回复格式示例。再次强调，直接按以下格式回复，不要思考过程，不要解释，不要多余内容：
    <新的表格>
    [{"tableName":"时空表格","tableIndex":0,"columns":["日期","时间","地点（当前描写）","此地角色"],"content":[["2024-01-01","12:00","异世界>酒馆","年轻女子"]]},{"tableName":"角色特征表格","tableIndex":1,"columns":["角色名","身体特征","性格","职业","爱好","喜欢的事物（作品、虚拟人物、物品等）","住所","其他重要信息"],"content":[["年轻女子","身形高挑/小麦色肌肤/乌黑长发/锐利眼睛","野性/不羁/豪爽/好奇","战士","习武","未知","未知","腰悬弯刀/兽牙项链/手指带血"]]},{"tableName":"角色与<user>社交表格","tableIndex":2,"columns":["角色名","对<user>关系","对<user>态度","对<user>好感"],"content":[["年轻女子","陌生人","疑惑/好奇","低"]]},{"tableName":"任务、命令或者约定表格","tableIndex":3,"columns":["角色","任务","地点","持续时间"],"content":[]},{"tableName":"重要事件历史表格","tableIndex":4,"columns":["角色","事件简述","日期","地点","情绪"],"content":[["年轻女子","进入酒馆/点酒/观察<user>","2024-01-01 12:00","异世界>酒馆","好奇"]]},{"tableName":"重要物品表格","tableIndex":5,"columns":["拥有人","物品描述","物品名","重要原因"],"content":[]}]
    </新的表格>
    `,
    rebuild_message_template_list:{},
    /**
     * ===========================
     * 双步设置
     * ===========================
     */
    // 双步
    step_by_step: false,
    // 双步是否使用主API
    step_by_step_use_main_api: true,
    // 双步累计的token数
    step_by_step_threshold: 500,
    // 双步字数累加
    sum_multiple_rounds: true,
    // 双步跳过整理后的确认弹窗
    bool_silent_refresh: false,
    /**
     * ===========================
     * 表格结构
     * ===========================
     */
    tableStructure: [
        {
            tableName: "时空表格", tableIndex: 0, columns: ['日期', '时间', '地点（当前描写）', '此地角色'], enable: true, Required: true, asStatus: true, toChat: true, note: "记录时空信息的表格，应保持在一行",
            initNode: '本轮需要记录当前时间、地点、人物信息，使用insertRow函数', updateNode: "当描写的场景，时间，人物变更时", deleteNode: "此表大于一行时应删除多余行",
        },
        {
            tableName: '角色特征表格', tableIndex: 1, columns: ['角色名', '身体特征', '性格', '职业', '爱好', '喜欢的事物（作品、虚拟人物、物品等）', '住所', '其他重要信息'], enable: true, Required: true, asStatus: true, toChat: true, note: '角色天生或不易改变的特征csv表格，思考本轮有否有其中的角色，他应作出什么反应',
            initNode: '本轮必须从上文寻找已知的所有角色使用insertRow插入，角色名不能为空', insertNode: '当本轮出现表中没有的新角色时，应插入', updateNode: "当角色的身体出现持久性变化时，例如伤痕/当角色有新的爱好，职业，喜欢的事物时/当角色更换住所时/当角色提到重要信息时", deleteNode: "",
        },
        {
            tableName: '角色与<user>社交表格', tableIndex: 2, columns: ['角色名', '对<user>关系', '对<user>态度', '对<user>好感'], enable: true, Required: true, asStatus: true, toChat: true, note: '思考如果有角色和<user>互动，应什么态度',
            initNode: '本轮必须从上文寻找已知的所有角色使用insertRow插入，角色名不能为空', insertNode: '当本轮出现表中没有的新角色时，应插入', updateNode: "当角色和<user>的交互不再符合原有的记录时/当角色和<user>的关系改变时", deleteNode: "",
        },
        {
            tableName: '任务、命令或者约定表格', tableIndex: 3, columns: ['角色', '任务', '地点', '持续时间'], enable: true, Required: false, asStatus: true, toChat: true, note: '思考本轮是否应该执行任务/赴约',
            insertNode: '当特定时间约定一起去做某事时/某角色收到做某事的命令或任务时', updateNode: "", deleteNode: "当大家赴约时/任务或命令完成时/任务，命令或约定被取消时",
        },
        {
            tableName: '重要事件历史表格', tableIndex: 4, columns: ['角色', '事件简述', '日期', '地点', '情绪'], enable: true, Required: true, asStatus: true, toChat: true, note: '记录<user>或角色经历的重要事件',
            initNode: '本轮必须从上文寻找可以插入的事件并使用insertRow插入', insertNode: '当某个角色经历让自己印象深刻的事件时，比如表白、分手等', updateNode: "", deleteNode: "",
        },
        {
            tableName: '重要物品表格', tableIndex: 5, columns: ['拥有人', '物品描述', '物品名', '重要原因'], enable: true, Required: false, asStatus: true, toChat: true, note: '对某人很贵重或有特殊纪念意义的物品',
            insertNode: '当某人获得了贵重或有特殊意义的物品时/当某个已有物品有了特殊意义时', updateNode: "", deleteNode: "",
        },
    ],
});
