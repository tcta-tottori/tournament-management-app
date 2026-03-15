const XLSX = require('xlsx');

const workbook = XLSX.readFile('../rank (1).xlsx');
const sheetName = workbook.SheetNames[0]; // 最初のシートを読む
const sheet = workbook.Sheets[sheetName];

// 最初の5行だけJSONにして構造を確認する
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log("SheetName:", sheetName);
console.log("Headers:");
console.log(data[0]);
console.log("Data sample:");
console.dir(data.slice(1, 5), { depth: null });
