export const DEFAULT_PAGE_SIZE = 20;

export function paginate(items, page, pageSize = DEFAULT_PAGE_SIZE) {
  const total = items?.length || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pages,
    pageSize,
    total,
    slice: (items || []).slice(start, start + pageSize),
    rangeLabel:
      total === 0
        ? "Nenhum registro"
        : `Mostrando ${start + 1}–${Math.min(start + pageSize, total)} de ${total}`,
  };
}

export function pagerHtml({ page, pages, rangeLabel, idPrefix = "pg" }) {
  const prevDisabled = page <= 1 ? " disabled" : "";
  const nextDisabled = page >= pages ? " disabled" : "";
  return `
    <div class="pager" data-pager="${idPrefix}">
      <span class="pager-range">${rangeLabel}</span>
      <span class="pager-controls">
        <button type="button" class="btn ghost pager-btn" data-pager-prev="${idPrefix}"${prevDisabled}>Anterior</button>
        <span class="pager-num">Página ${page} de ${pages}</span>
        <button type="button" class="btn ghost pager-btn" data-pager-next="${idPrefix}"${nextDisabled}>Próxima</button>
      </span>
    </div>`;
}

export function bindPager(root, idPrefix, { getPage, setPage, onChange }) {
  root.querySelector(`[data-pager-prev="${idPrefix}"]`)?.addEventListener("click", () => {
    setPage(Math.max(1, getPage() - 1));
    onChange();
  });
  root.querySelector(`[data-pager-next="${idPrefix}"]`)?.addEventListener("click", () => {
    setPage(getPage() + 1);
    onChange();
  });
}
