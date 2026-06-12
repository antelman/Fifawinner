/* בניית גרסה עצמאית (קובץ HTML יחיד) לנייד — node scripts/build-standalone.js */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

let html = read("index.html");
const css = read("css/style.css");
const js = ["js/data.js", "js/model.js", "js/app.js"].map(read).join("\n;\n");

html = html.replace('<link rel="stylesheet" href="css/style.css">', "<style>\n" + css + "\n</style>");
html = html.replace(
  /<script src="js\/data.js"><\/script>\s*<script src="js\/model.js"><\/script>\s*<script src="js\/app.js"><\/script>/,
  "<script>\n" + js + "\n</script>");

if (html.includes('src="js/') || html.includes('href="css/'))
  throw new Error("נשארו הפניות חיצוניות — הבנייה נכשלה");

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/FifaWinner.html"), html);
console.log("✅ dist/FifaWinner.html — " + (html.length / 1024).toFixed(0) + "KB");
