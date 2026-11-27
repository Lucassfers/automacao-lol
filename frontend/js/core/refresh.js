// Indireção do refresh(): componentes e serviços pedem um novo render sem importar a camada app/.

let handler = null;

export function setRefreshHandler(fn) {
  handler = fn;
}

export function refresh() {
  if (!handler) throw new Error("refresh() chamado antes de setRefreshHandler().");
  handler();
}
