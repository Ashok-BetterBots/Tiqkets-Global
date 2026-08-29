import { renderWaMessage, renderForBranch, invalidateWaTemplateCache, getWaTemplateBody } from "./server/wa-templates";

async function main() {
  invalidateWaTemplateCache();
  const body = await getWaTemplateBody("fifo", "now_serving", "en");
  console.log("BODY:", JSON.stringify(body));

  const rendered = await renderWaMessage("fifo", "now_serving", "en", {
    customer_name: "Alice", ticket_number: "A042", branch_name: "Test Branch",
  });
  console.log("RENDERED:", JSON.stringify(rendered));
}
main().catch((e) => { console.error(e); process.exit(1); });
