export function staticDataUrl(fileName: string) {
  return `${import.meta.env.BASE_URL}data/${fileName}?v=${Date.now()}`
}
