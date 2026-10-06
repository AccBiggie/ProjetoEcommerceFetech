export const getErrorMessage = error => error.response?.data?.message || error.message || "Não foi possível conectar ao servidor. Tente novamente.";
