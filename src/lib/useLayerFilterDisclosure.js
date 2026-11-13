import useStore from '@/lib/store';

export function useLayerFilterDisclosure(layerId, key, fallback) {
  const value = useStore((state) => Object.hasOwn(state.layerFilterDisclosure[layerId] || {}, key) ? state.layerFilterDisclosure[layerId][key] : fallback);
  const setValue = (next) => useStore.getState().setLayerFilterDisclosure(layerId, key, next);
  return [value, setValue];
}
