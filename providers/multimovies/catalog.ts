// Routes verified against the current Multimovies provider implementation.
export const catalog = [
  { title: "Latest Movies", filter: "/catalog?type=movie&sort=latest" },
  { title: "Latest TV Shows", filter: "/catalog?type=tv&sort=latest" },
  { title: "Trending", filter: "/catalog?sort=rating" },
  { title: "Hollywood", filter: "/catalog?genre=hollywood&sort=latest" },
  { title: "Family", filter: "/catalog?genre=family&sort=latest" },
];

export const genres = [
  { title: "Hollywood", filter: "/catalog?genre=hollywood&sort=latest" },
  { title: "Family", filter: "/catalog?genre=family&sort=latest" },
  { title: "Bollywood", filter: "/catalog?genre=bollywood-movies&sort=latest" },
  { title: "South Indian", filter: "/catalog?genre=south-indian&sort=latest" },
  { title: "Netflix", filter: "/catalog?genre=netflix&sort=latest" },
  { title: "Jio Hotstar", filter: "/catalog?genre=disney-hotstar&sort=latest" },
  { title: "Anime Series", filter: "/catalog?genre=anime-series&sort=latest" },
  { title: "Anime Movies", filter: "/catalog?genre=anime-movies&sort=latest" },
];
