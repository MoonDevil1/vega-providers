// Multimovies uses route-based pages, not a /catalog JSON endpoint.
export const catalog = [
  { title: "Trending", filter: "trending" },
  { title: "Movies", filter: "movies" },
  { title: "TV Shows", filter: "series" },
  { title: "K-Drama", filter: "genre/k-drama" },
];

export const genres = [
  { title: "Action", filter: "genre/action" },
  { title: "Comedy", filter: "genre/comedy" },
  { title: "Drama", filter: "genre/drama" },
  { title: "Horror", filter: "genre/horror" },
  { title: "Thriller", filter: "genre/thriller" },
];