import path from "node:path";
import fs from "node:fs";

const MODELS_FILE = path.join(process.cwd(), ".claude", "models.json");

export async function models(argv: string[] = []) {
  const [sub, ...rest] = argv;
  fs.mkdirSync(path.dirname(MODELS_FILE), { recursive: true });
  let models: string[] = [];
  if (fs.existsSync(MODELS_FILE)) {
    try {
      models = JSON.parse(fs.readFileSync(MODELS_FILE, "utf8") || "[]");
    } catch {}
  }
  switch (sub) {
    case "list":
      console.log(models.join("\n"));
      break;
    case "add":
      if (!rest[0]) {
        console.error("Usage: ccr models add <model-name>");
        return;
      }
      models.push(rest[0]);
      fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2));
      console.log("Added", rest[0]);
      break;
    case "remove":
      if (!rest[0]) {
        console.error("Usage: ccr models remove <model-name>");
        return;
      }
      models = models.filter(m => m !== rest[0]);
      fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2));
      console.log("Removed", rest[0]);
      break;
    default:
      console.log("Usage: ccr models <list|add|remove>");
  }
}
