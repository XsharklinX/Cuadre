import { createMMKV } from "react-native-mmkv";

import type { KeyValueStorage } from "@/persistence/keyValueStorage";

export function createMmkvStorage(): KeyValueStorage {
  const storage = createMMKV({
    id: "habitos.local.v1",
  });

  return {
    getString: (key) => storage.getString(key),
    setString: (key, value) => storage.set(key, value),
    delete: (key) => {
      storage.remove(key);
    },
    getAllKeys: () => storage.getAllKeys(),
  };
}
