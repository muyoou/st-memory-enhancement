import { BASE, EDITOR, USER } from "../../core/manager.js";
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { debugLog } from "../../services/debugs.js";

export async function customSheetsStylePopup() {
	const customStyleEditor = `
<div class="column-editor">
    <div class="popup-content">
        自定义推送至对话的表格的包裹样式，支持HTML与CSS，使用$0表示表格整体的插入位置
    </div>
    <div class="column-editor-body">
        <textarea id="customStyleEditor" class="column-editor-textarea" rows="30" placeholder="请输入自定义样式"></textarea>
    </div>
</div>
`;
	const customStylePopup = new EDITOR.Popup(
		customStyleEditor,
		EDITOR.POPUP_TYPE.CONFIRM,
		"",
		{ large: true, okButton: "应用修改", cancelButton: "取消" }
	);
	const styleContainer = $(customStylePopup.dlg)[0];
	const resultDataContainer =
		styleContainer.querySelector("#customStyleEditor");
	resultDataContainer.style.display = "flex";
	resultDataContainer.style.flexDirection = "column";
	resultDataContainer.style.flexGrow = "1";
	resultDataContainer.style.width = "100%";
	resultDataContainer.style.height = "100%";

	// 获取resultDataContainer中的resultData
	let resultData = USER.tableBaseSetting.to_chat_container;
	// 如果没有resultData，则使用默认值
	if (!resultData) {
		resultData = `<div class="table-container"><div class="table-content">$0</div></div>`;
	}
	// 设置resultDataContainer的值
	resultDataContainer.value = resultData;

	await customStylePopup.show();
	if (customStylePopup.result) {
		USER.tableBaseSetting.to_chat_container = resultDataContainer.value;
		updateSystemMessageTableStatus();
	}
	// debugLog(resultDataContainer.value)
}
