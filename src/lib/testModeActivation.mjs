export const isTestModeActivation = (searchParams) =>
  searchParams?.getAll('testmodus').length === 1 &&
  searchParams.get('testmodus') === '1';
