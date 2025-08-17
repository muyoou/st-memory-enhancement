/**
 * compositeTableRenderer.js
 *
 * This file contains the logic for the new "Master Template" rendering mode.
 * It allows a single template to render a composite view using data from multiple tables.
 */
import { debugLog, debugWarn } from "../../services/debugs.js";
/**
 * Renders a composite view using a master template and data from all available tables.
 * @param {Sheet} masterSheet - The sheet object that contains the master template.
 * @param {Sheet[]} allSheets - An array of all sheet objects available for rendering.
 * @param {HTMLElement} container - The DOM element to render the final HTML into.
 */
export function renderCompositeView(masterSheet, allSheets, container) {
	debugLog("Entering composite rendering mode.");

	// 1. Create the tables context object
	const tablesContext = allSheets.reduce((acc, sheet) => {
		// Use table name as the key. Ensure names are unique or handle potential collisions.
		acc[sheet.name] = sheet;
		return acc;
	}, {});

	// 2. Get the master template from the master sheet's configuration
	const masterTemplate =
		masterSheet.config.customStyles[
			masterSheet.config.selectedCustomStyleKey
		]?.replace || "";
	if (!masterTemplate) {
		debugWarn("Master template is empty. Aborting composite render.");
		container.innerHTML =
			'<div style="color: red;">Master template is defined but empty.</div>';
		return;
	}

	// 3. Parse and render the template
	const finalHtml = parseCompositeRender(masterTemplate, tablesContext);

	// 4. Inject the final HTML into the container
	container.innerHTML = finalHtml;
}

/**
 * Parses a master template, replacing extended placeholders with data from the tablesContext.
 * @param {string} template - The HTML template string with extended placeholders (e.g., $tableName.A1).
 * @param {Object.<string, Sheet>} tablesContext - A map of table names to sheet objects.
 * @returns {string} The processed HTML string with data injected.
 */
function parseCompositeRender(template, tablesContext) {
	// Extended regex to capture: 1: tableName, 2: colLetter, 3: rowNumber
	const placeholderRegex = /\$([\w_.-]+)\.(\w)(\d+)/g;

	return template.replace(
		placeholderRegex,
		(match, tableName, colLetter, rowNumber) => {
			const targetSheet = tablesContext[tableName];

			if (!targetSheet) {
				return `<span style="color: orange;" title="Table '${tableName}' not found.">?</span>`;
			}

			const colIndex =
				colLetter.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
			const rowIndex = parseInt(rowNumber, 10);

			const cell = targetSheet.findCellByPosition(rowIndex, colIndex);

			return cell
				? cell.data.value || ""
				: `<span style="color: red;" title="Cell ${colLetter}${rowNumber} not found in table '${tableName}'.">?</span>`;
		}
	);
}
