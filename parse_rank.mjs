import * as XLSX from 'xlsx';

try {
  const workbook = XLSX.readFile('../rank (1).xlsx');
  const sheetName = workbook.SheetNames[0]; // 最初のシートを読む
  const sheet = workbook.Sheets[sheetName];

  // Jsonに変換
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log("SheetName:", sheetName);
  console.log("Headers:");
  console.log(data[0]);
  console.log("Data sample:");
  console.dir(data.slice(1, 5), { depth: null });
} catch (e) {
  console.error("Error formatting XLSX:", e.message);
}
