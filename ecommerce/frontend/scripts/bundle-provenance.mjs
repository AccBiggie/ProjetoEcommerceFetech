import path from 'node:path';

// Build metadata only: no source code, credentials or absolute workstation paths.
export function bundleProvenance(root) {
  return {
    name: 'fetech-bundle-provenance',
    apply: 'build',
    generateBundle(_, bundle) {
      const modules = Object.fromEntries(Object.values(bundle)
        .filter(asset => asset.type === 'chunk')
        .map(chunk => [chunk.fileName, Object.keys(chunk.modules).map(id =>
          path.relative(root, id).replaceAll('\\', '/')).filter(id => id.startsWith('src/'))]));
      this.emitFile({ type: 'asset', fileName: '.vite/modules.json', source: JSON.stringify(modules, null, 2) });
    },
  };
}
