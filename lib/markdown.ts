function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function linkify(value: string) {
  return value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
    const safeText = text as string;
    const safeHref = href as string;
    return `<a href="${safeHref}" class="underline text-blue-700">${safeText}</a>`;
  });
}

export function markdownToHtml(markdown: string) {
  let html = escapeHtml(markdown);

  html = html.replace(/^###\s+(.+)$/gm, "<h3 class=\"text-base font-semibold\">$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2 class=\"text-lg font-semibold\">$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1 class=\"text-xl font-semibold\">$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code class=\"rounded bg-neutral-200 px-1\">$1</code>");
  html = linkify(html);

  const blocks = html
    .split(/\n{2,}/)
    .map((block) => {
      if (block.startsWith("<h1") || block.startsWith("<h2") || block.startsWith("<h3")) {
        return block;
      }

      return `<p>${block.replaceAll("\n", "<br />")}</p>`;
    })
    .join("");

  return blocks;
}
