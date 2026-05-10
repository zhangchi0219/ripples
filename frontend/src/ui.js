import { Pane } from 'tweakpane';

export function createUI(container, params, callbacks) {
  const pane = new Pane({ container, title: 'Wave Interference' });

  pane.addBinding(params, 'particleResolution', { min: 32, max: 512, step: 1, label: 'Resolution' })
    .on('change', () => callbacks.onResolutionChange());

  pane.addBinding(params, 'fieldSize', { min: 5, max: 50, step: 0.5, label: 'Field Size' });
  pane.addBinding(params, 'waveSpeed', { min: 0.5, max: 20, step: 0.1, label: 'Wave Speed' });
  pane.addBinding(params, 'defaultWavelength', { min: 0.5, max: 10, step: 0.1, label: 'Wavelength' });
  pane.addBinding(params, 'defaultAmplitude', { min: 0.1, max: 5, step: 0.1, label: 'Amplitude' });
  pane.addBinding(params, 'defaultDecay', { min: 0.1, max: 5, step: 0.1, label: 'Decay' });
  pane.addBinding(params, 'pointSize', { min: 1, max: 10, step: 0.5, label: 'Point Size' });
  pane.addBinding(params, 'colorLow', { label: 'Color Low' });
  pane.addBinding(params, 'colorHigh', { label: 'Color High' });
  pane.addBinding(params, 'paused', { label: 'Paused' });

  return pane;
}
