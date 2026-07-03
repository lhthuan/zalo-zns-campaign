// Shared sentinel + label for "no batch filter / send to everyone", used by
// both the customers list filter and the broadcast-campaign customer picker
// so the two never drift apart (e.g. one saying "Tất cả khách hàng", the
// other leaking the raw sentinel value).
export const ALL_CUSTOMERS_BATCH = "__all__";
export const ALL_CUSTOMERS_LABEL = "Tất cả khách hàng";
