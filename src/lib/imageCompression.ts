export interface CompressionResult {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  originalSize: number;
  finalSize: number;
  mimeType: string;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function compressImage(file: File): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Por favor, selecione um arquivo de imagem válido.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Detect webp support
          let isWebpSupported = false;
          try {
            isWebpSupported = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
          } catch (err) {
            isWebpSupported = false;
          }

          const targetMime = isWebpSupported ? 'image/webp' : 'image/jpeg';

          // Compression profiles: pairs of (maxWidth, quality) to try in order
          const profiles = [
            { maxWidth: 1280, quality: 0.72 },
            { maxWidth: 1280, quality: 0.60 },
            { maxWidth: 1280, quality: 0.50 },
            { maxWidth: 1024, quality: 0.72 },
            { maxWidth: 1024, quality: 0.60 },
            { maxWidth: 1024, quality: 0.50 },
            { maxWidth: 800, quality: 0.72 },
            { maxWidth: 800, quality: 0.60 },
            { maxWidth: 800, quality: 0.50 }
          ];

          const ONE_MB = 1024 * 1024;
          let bestResult: { blob: Blob; width: number; height: number } | null = null;

          for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            
            // Allow UI to breathe and prevent locking
            await delay(10);

            const result = await new Promise<{ blob: Blob; width: number; height: number }>((res, rej) => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;

              if (width > profile.maxWidth) {
                height = Math.round((height * profile.maxWidth) / width);
                width = profile.maxWidth;
              }

              canvas.width = width;
              canvas.height = height;

              const ctx = canvas.getContext('2d');
              if (!ctx) {
                rej(new Error('Erro ao criar contexto do canvas.'));
                return;
              }

              ctx.drawImage(img, 0, 0, width, height);

              canvas.toBlob((b) => {
                if (b) {
                  res({ blob: b, width, height });
                } else {
                  rej(new Error('Falha ao gerar blob do canvas.'));
                }
              }, targetMime, profile.quality);
            });

            bestResult = result;

            if (result.blob.size <= ONE_MB) {
              // Successfully optimized below 1 MB!
              const previewUrl = URL.createObjectURL(result.blob);
              resolve({
                blob: result.blob,
                previewUrl,
                width: result.width,
                height: result.height,
                originalSize: file.size,
                finalSize: result.blob.size,
                mimeType: targetMime
              });
              return;
            }
          }

          // If we completed all profiles and still couldn't get below 1 MB
          if (bestResult) {
            reject(new Error(`Não foi possível otimizar a imagem abaixo de 1 MB. Tamanho mínimo alcançado: ${(bestResult.blob.size / ONE_MB).toFixed(2)} MB.`));
          } else {
            reject(new Error('Erro desconhecido ao otimizar a imagem.'));
          }

        } catch (compError: any) {
          reject(compError);
        }
      };
      img.onerror = () => reject(new Error('Erro ao analisar arquivo de imagem.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}
