export const readFilesAsText = async (files: File[]): Promise<{ name: string; content: string }[]> => {
  const promises = files.map((file) => {
    return new Promise<{ name: string; content: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result;
        if (typeof content === 'string') {
          resolve({
            name: file.name,
            content: content
          });
        } else {
          reject(new Error(`Failed to read file: ${file.name}`));
        }
      };
      reader.onerror = () => reject(new Error(`Error reading file: ${file.name}`));
      reader.readAsText(file);
    });
  });

  return Promise.all(promises);
};