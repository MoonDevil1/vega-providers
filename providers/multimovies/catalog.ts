// Only use routes confirmed on multimovies.garden. Avoid fake category
// paths that silently return the same archive for every Vega home section.
export const catalog = [
  { title: "Latest Updates", filter: "/" },
  { title: "Hollywood", filter: "/genre/hollywood?sort=latest" },
  { title: "Family", filter: "/genre/family" },
];

export const genres = [
  { title: "Hollywood", filter: "/genre/hollywood?sort=latest" },
  { title: "Family", filter: "/genre/family" },
];
