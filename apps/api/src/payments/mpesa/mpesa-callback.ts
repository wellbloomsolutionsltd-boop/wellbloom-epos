export type MpesaCallbackItem = {
  Name?: string;
  Value?: string | number;
};

export function getCallbackValue(
  items: MpesaCallbackItem[] | undefined,
  name: string,
) {
  if (!items) {
    return undefined;
  }

  return items.find(
    (item) =>
      item.Name === name,
  )?.Value;
}
