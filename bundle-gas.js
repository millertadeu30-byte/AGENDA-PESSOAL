import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, "dist");
const OUTPUT_DIR = path.join(__dirname, "google-apps-script");

// Transparent polyfill that intercepts fetch and routes to google.script.run when inside Google Apps Script
const POLYFILL = `
// ====================================================================
//            TRANSPARENT POLYFILL FOR GOOGLE APPS SCRIPT (GAS)
// ====================================================================
// Se o aplicativo estiver rodando dentro do iframe do Google Apps Script,
// esta seção interceptará chamadas "fetch()" para "/api/*" e as redirecionará
// de forma totalmente transparente para funções "google.script.run" no backend.
if (typeof google !== "undefined" && google.script && google.script.run) {
  console.log("[TaskControl Pro] Rodando em modo Google Apps Script Web App! Polyfill ativado.");
  
  window.fetch = function(url, options) {
    return new Promise((resolve, reject) => {
      const method = (options && options.method || "GET").toUpperCase();
      const body = options && options.body ? JSON.parse(options.body) : null;
      
      let functionName = "";
      let args = [];
      
      if (url.startsWith("/api/auth/register")) {
        functionName = "api_auth_register";
        args = [body];
      } else if (url.startsWith("/api/auth/login")) {
        functionName = "api_auth_login";
        args = [body];
      } else if (url.startsWith("/api/admin/clients/update")) {
        functionName = "api_admin_clients_update";
        args = [body];
      } else if (url.includes("/api/admin/clients/")) {
        // DELETE /api/admin/clients/:adminToken/:clientToken ou GET /api/admin/clients/:adminToken
        const parts = url.split("/");
        const adminToken = parts[4];
        const clientToken = parts[5];
        if (method === "DELETE") {
          functionName = "api_admin_clients_delete";
          args = [adminToken, clientToken];
        } else {
          functionName = "api_admin_clients_get";
          args = [adminToken];
        }
      } else if (url.startsWith("/api/client/")) {
        const token = url.split("/").pop();
        functionName = "api_client_get";
        args = [token];
      } else if (url.startsWith("/api/tasks/conclude")) {
        functionName = "api_tasks_conclude";
        args = [body];
      } else if (url.startsWith("/api/tasks")) {
        if (method === "POST") {
          functionName = "api_tasks_create";
          args = [body];
        } else if (method === "PUT") {
          functionName = "api_tasks_update";
          args = [body];
        } else if (method === "DELETE") {
          functionName = "api_tasks_delete";
          args = [body];
        }
      }
      
      if (!functionName) {
        console.error("[TaskControl Pro] URL não mapeada no Apps Script:", url);
        reject(new Error("Endpoint não mapeado no Apps Script: " + url));
        return;
      }
      
      console.log("[TaskControl Pro] Redirecionando fetch para:", functionName, args);
      
      google.script.run
        .withSuccessHandler((response) => {
          const resObj = {
            ok: response && !response.erro,
            status: response && response.erro ? 400 : 200,
            json: () => Promise.resolve(response),
            text: () => Promise.resolve(JSON.stringify(response))
          };
          resolve(resObj);
        })
        .withFailureHandler((err) => {
          console.error("[TaskControl Pro] Erro na função Apps Script:", functionName, err);
          reject(err);
        })[functionName](...args);
    });
  };
}
`;

function bundle() {
  console.log("Iniciando empacotamento para o Google Apps Script...");

  if (!fs.existsSync(DIST_DIR)) {
    console.error("Erro: A pasta /dist não existe. Execute 'npm run build' primeiro.");
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const indexPath = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error("Erro: Arquivo index.html não encontrado na pasta dist.");
    process.exit(1);
  }

  let htmlContent = fs.readFileSync(indexPath, "utf-8");

  // 1. Procurar arquivos de assets (JS e CSS)
  const assetsDir = path.join(DIST_DIR, "assets");
  if (!fs.existsSync(assetsDir)) {
    console.error("Erro: Pasta dist/assets não encontrada.");
    process.exit(1);
  }

  const files = fs.readdirSync(assetsDir);
  const jsFile = files.find(f => f.endsWith(".js"));
  const cssFile = files.find(f => f.endsWith(".css"));

  if (!jsFile) {
    console.error("Erro: Arquivo JS compilado não encontrado.");
    process.exit(1);
  }

  let jsContent = fs.readFileSync(path.join(assetsDir, jsFile), "utf-8");
  let cssContent = cssFile ? fs.readFileSync(path.join(assetsDir, cssFile), "utf-8") : "";

  // 2. Substituir links de CSS por tag <style> embutida
  if (cssFile) {
    const cssTagRegex = new RegExp(`<link[^>]*href=["']?/[^"']*${cssFile}["']?[^>]*>`, "i");
    const replacementCss = `<style>\n${cssContent}\n</style>`;
    
    if (cssTagRegex.test(htmlContent)) {
      htmlContent = htmlContent.replace(cssTagRegex, () => replacementCss);
    } else {
      // Fallback genérico para links de stylesheet
      htmlContent = htmlContent.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, "");
      htmlContent = htmlContent.replace("</head>", () => `${replacementCss}\n</head>`);
    }
  }

  // 3. Substituir tag de Script JS por tag <script> embutida contendo o Polyfill e o JS original
  const jsTagRegex = new RegExp(`<script[^>]*src=["']?/[^"']*${jsFile}["']?[^>]*><\\/script>`, "i");
  const replacementJs = `<script type="text/javascript">\n${POLYFILL}\n\n${jsContent}\n</script>`;

  if (jsTagRegex.test(htmlContent)) {
    htmlContent = htmlContent.replace(jsTagRegex, () => replacementJs);
  } else {
    // Fallback genérico se não achou pelo regex exato
    htmlContent = htmlContent.replace(/<script[^>]*type=["']module["'][^>]*><\/script>/gi, "");
    htmlContent = htmlContent.replace("</body>", () => `${replacementJs}\n</body>`);
  }

  // 4. Salvar o arquivo final Index.html compactado na pasta google-apps-script
  const outputIndexPath = path.join(OUTPUT_DIR, "Index.html");
  fs.writeFileSync(outputIndexPath, htmlContent, "utf-8");

  console.log(`\n=========================================`);
  console.log(`🎉 SUCESSO! Arquivo embutido gerado com êxito!`);
  console.log(`Local do arquivo: ${outputIndexPath}`);
  console.log(`Tamanho do arquivo: ${(htmlContent.length / 1024).toFixed(2)} KB`);
  console.log(`=========================================\n`);
}

bundle();
