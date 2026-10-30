/** Drawer lateral de perfil — abertura, fechamento e acessibilidade. */

let drawerEl = null;
let onCloseCallback = null;

export function bindClientDrawer(dialog, { onClose } = {}) {
  if (!dialog || dialog.dataset.haDrawerBound === "1") return;
  dialog.dataset.haDrawerBound = "1";
  drawerEl = dialog;
  onCloseCallback = onClose;

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeClientDrawer();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("profile-drawer-open");
    onCloseCallback?.();
  });
  if (!document.body.dataset.haDrawerEscBound) {
    document.body.dataset.haDrawerEscBound = "1";
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawerEl?.open) {
        e.preventDefault();
        closeClientDrawer();
      }
    });
  }
}

export function openClientDrawer(dialog) {
  if (!dialog.open) {
    document.body.classList.add("profile-drawer-open");
    dialog.showModal();
  }
}

export function closeClientDrawer() {
  if (drawerEl?.open) drawerEl.close();
}

export function isClientDrawerOpen() {
  return Boolean(drawerEl?.open);
}
