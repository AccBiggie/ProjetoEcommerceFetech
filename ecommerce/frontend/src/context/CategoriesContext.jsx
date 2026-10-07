import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getErrorMessage } from "../utils/api";

const CategoriesContext = createContext(null);

export function categoryDescendants(categories, id) {
  const ids = new Set(id ? [id] : []);
  let previous;
  do {
    previous = ids.size;
    for (const category of categories) if (ids.has(category.parent_id)) ids.add(category._id);
  } while (ids.size !== previous);
  return ids;
}

function orderedCategories(categories) {
  const result = [], visited = new Set();
  const visit = (category, depth, path) => {
    if (visited.has(category._id)) return;
    visited.add(category._id);
    const label = [...path, category.name].join(" / ");
    result.push({ ...category, depth, label });
    categories.filter(child => child.parent_id === category._id).forEach(child => visit(child, depth + 1, [...path, category.name]));
  };
  categories.filter(category => !category.parent_id).forEach(category => visit(category, 0, []));
  categories.filter(category => !visited.has(category._id)).forEach(category => visit(category, 0, []));
  return result;
}

export function CategoriesProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/v1/categories");
      setCategories(data.categories);
      setError("");
      return data.categories;
    } catch (error) {
      setError(getErrorMessage(error));
      throw error;
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload().catch(() => {}); }, [reload]);
  const ordered = useMemo(() => orderedCategories(categories), [categories]);
  return <CategoriesContext.Provider value={{ categories, ordered, loading, error, reload }}>{children}</CategoriesContext.Provider>;
}

export const useCategories = () => useContext(CategoriesContext);
