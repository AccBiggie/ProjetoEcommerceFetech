import axios from "axios";

export const addressApi = {
  list: async () => (await axios.get("/api/v1/addresses")).data.addresses,
  create: async payload => (await axios.post("/api/v1/address/new", payload)).data.address,
  update: async (id, payload) => (await axios.put(`/api/v1/address/${id}`, payload)).data.address,
  remove: async id => axios.delete(`/api/v1/address/${id}`),
  favorite: async id => (await axios.put(`/api/v1/address/${id}/favorite`)).data.address,
};
