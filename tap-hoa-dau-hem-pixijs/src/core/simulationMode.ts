/** URL-gated local simulation profile; it always uses a separate save namespace. */
export const isMaxLevelSimulation = typeof window !== 'undefined'
  && typeof window.location?.search === 'string'
  && new URLSearchParams(window.location.search).get('simulate') === 'max';
