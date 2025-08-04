export const cellStyle = `
    .sheet-table { border-collapse: collapse; width: max-content; }
    .sheet-cell { border: 1px solid var(--SmartThemeBodyColor); padding: 1px; min-width: 28px; text-align: center; vertical-align: middle; cursor: cell; }
    .sheet-cell-origin { min-width: 20px; min-height: 20px }
    .sheet-header-cell-top { font-weight: bold }
    .sheet-header-cell-left { font-weight: bold }
    .sheet-cell-other { min-width: 50px; border: 1px dashed var(--SmartThemeEmColor); }
`

// Helper function to convert column index to letter (A, B, C...)
export function getColumnLetter(colIndex) {
    let letter = '';
    let num = colIndex;
    while (num >= 0) {
        letter = String.fromCharCode('A'.charCodeAt(0) + (num % 26)) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
}

export function filterSavingData(sheet, key=["uid", "name", "domain", "type", "enable", "required", "tochat", "triggerSend", "triggerSendDeep", "hashSheet", "cellHistory", "config"], withHead = false) {
    const r = {}
    key.forEach(k => {
        if(k === 'cellHistory') {
            r.cellHistory = sheet.cellHistory.map((
                {
                    uid, type, status, coordUid, data, targetUid
                }) => {
                const obj = { uid, coordUid, data };
                if (status !== '') obj.status = status;
                if (targetUid !== '') obj.targetUid = targetUid;
                if (type !== 'cell') obj.type = type;
                return obj;
            });
            return
        }
        if(k === 'content') {
            r.content = sheet.getContent(withHead)
            return
        }
        if(k === 'sourceData') {
            r.sourceData = sheet.source.data
            return
        }
        if(k === 'hashSheet'){
            r.hashSheet = sheet.hashSheet.map(row => row.map(cell=> cell))
            return
        }
        r[k] = sheet[k];
    })
    const rr = JSON.parse(JSON.stringify(r));
    return rr;
}
