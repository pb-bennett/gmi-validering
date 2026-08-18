export const retainKommuneOptions = (currentOptions, nextOptions) =>
  Array.isArray(nextOptions) ? nextOptions : currentOptions;
