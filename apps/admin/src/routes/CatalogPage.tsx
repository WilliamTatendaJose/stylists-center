import { useState } from 'react';
import type { AdminCategoryRowDto, AdminCityRowDto, CityInput } from '@sc/shared';
import {
  useCategories,
  useCities,
  useCreateCategory,
  useCreateCity,
  useDeleteCategory,
  useDeleteCity,
  useUpdateCategory,
  useUpdateCity,
} from '../api/catalog';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';

const EMPTY_CITY: CityInput = {
  name: '',
  timezone: 'Africa/Harare',
  centroidLat: 0,
  centroidLng: 0,
  bboxWest: 0,
  bboxSouth: 0,
  bboxEast: 0,
  bboxNorth: 0,
};

// --- Categories --------------------------------------------------------

function CreateCategoryForm({
  categories,
  onDone,
}: {
  categories: AdminCategoryRowDto[];
  onDone: () => void;
}) {
  const createCategory = useCreateCategory();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return;
    setError(null);
    createCategory.mutate(
      { name: name.trim(), parentId: parentId || null },
      {
        onSuccess: onDone,
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not create category.');
        },
      },
    );
  };

  return (
    <div className="mb-4 rounded-xl bg-neutral-50 p-4 dark:bg-white/5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-dark-muted">
            Parent (optional)
          </span>
          <select
            value={parentId}
            onChange={(e) => {
              setParentId(e.target.value);
            }}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-accent focus:outline-none dark:border-dark-border dark:bg-white/5 dark:text-dark-text"
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className="mb-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={createCategory.isPending}>
          Create
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function CategoryRow({ category }: { category: AdminCategoryRowDto }) {
  const updateCategory = useUpdateCategory(category.id);
  const deleteCategory = useDeleteCategory();
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);

  const changed = name.trim() !== category.name && name.trim().length > 0;

  const save = () => {
    setError(null);
    updateCategory.mutate(
      { name: name.trim() },
      {
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not rename.');
        },
      },
    );
  };

  const remove = () => {
    if (!window.confirm(`Delete "${category.name}"?`)) return;
    setError(null);
    deleteCategory.mutate(category.id, {
      onError: (err) => {
        setError(err instanceof ApiError ? err.message : 'Could not delete.');
      },
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          className="w-48 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-accent focus:outline-none dark:border-dark-border dark:bg-white/5 dark:text-dark-text"
        />
        {category.parentName ? (
          <span className="text-sm text-neutral-500 dark:text-dark-muted">
            under {category.parentName}
          </span>
        ) : null}
        <Badge label={`${String(category.providerCount)} providers`} tone="neutral" />
        {error ? (
          <span className="text-sm text-accent-700 dark:text-dark-accent">{error}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {changed ? (
          <Button variant="secondary" onClick={save} disabled={updateCategory.isPending}>
            Save
          </Button>
        ) : null}
        <Button variant="danger" onClick={remove} disabled={deleteCategory.isPending}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function CategoriesSection() {
  const { data: categories, isLoading, isError } = useCategories();
  const [creating, setCreating] = useState(false);

  return (
    <Card padded={false} className="mb-8">
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-dark-border">
        <h2 className="font-semibold text-neutral-900 dark:text-dark-text">Categories</h2>
        {!creating ? (
          <Button
            variant="secondary"
            onClick={() => {
              setCreating(true);
            }}
          >
            Add category
          </Button>
        ) : null}
      </div>

      <div className="p-5 pb-0">
        {creating ? (
          <CreateCategoryForm
            categories={categories ?? []}
            onDone={() => {
              setCreating(false);
            }}
          />
        ) : null}
      </div>

      {isLoading ? (
        <p className="px-5 pb-5 text-sm text-neutral-600 dark:text-dark-muted">Loading…</p>
      ) : null}
      {isError ? (
        <p className="px-5 pb-5 text-sm text-accent-700 dark:text-dark-accent">
          Couldn&apos;t load categories.
        </p>
      ) : null}

      <div className="divide-y divide-neutral-200 dark:divide-dark-border">
        {categories?.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
      </div>
    </Card>
  );
}

// --- Cities --------------------------------------------------------------

function CityForm({
  initial,
  onSubmit,
  onCancel,
  pending,
}: {
  initial: CityInput;
  onSubmit: (input: CityInput) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof CityInput) => (value: string) => {
    setForm((f) => ({ ...f, [key]: key === 'name' || key === 'timezone' ? value : Number(value) }));
  };

  const submit = () => {
    if (!form.name.trim() || !form.timezone.trim()) {
      setError('Name and timezone are required.');
      return;
    }
    setError(null);
    onSubmit(form);
  };

  return (
    <div className="mb-4 rounded-xl bg-neutral-50 p-4 dark:bg-white/5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TextField
          label="Name"
          value={form.name}
          onChange={(e) => {
            set('name')(e.target.value);
          }}
        />
        <TextField
          label="Timezone"
          value={form.timezone}
          onChange={(e) => {
            set('timezone')(e.target.value);
          }}
        />
        <TextField
          label="Centroid lat"
          value={String(form.centroidLat)}
          onChange={(e) => {
            set('centroidLat')(e.target.value);
          }}
        />
        <TextField
          label="Centroid lng"
          value={String(form.centroidLng)}
          onChange={(e) => {
            set('centroidLng')(e.target.value);
          }}
        />
        <TextField
          label="Bbox west"
          value={String(form.bboxWest)}
          onChange={(e) => {
            set('bboxWest')(e.target.value);
          }}
        />
        <TextField
          label="Bbox south"
          value={String(form.bboxSouth)}
          onChange={(e) => {
            set('bboxSouth')(e.target.value);
          }}
        />
        <TextField
          label="Bbox east"
          value={String(form.bboxEast)}
          onChange={(e) => {
            set('bboxEast')(e.target.value);
          }}
        />
        <TextField
          label="Bbox north"
          value={String(form.bboxNorth)}
          onChange={(e) => {
            set('bboxNorth')(e.target.value);
          }}
        />
      </div>
      {error ? <p className="mb-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function CityRow({ city }: { city: AdminCityRowDto }) {
  const updateCity = useUpdateCity(city.id);
  const deleteCity = useDeleteCity();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    if (!window.confirm(`Delete "${city.name}"?`)) return;
    setError(null);
    deleteCity.mutate(city.id, {
      onError: (err) => {
        setError(err instanceof ApiError ? err.message : 'Could not delete.');
      },
    });
  };

  if (editing) {
    return (
      <div className="px-5 py-4">
        <CityForm
          initial={city}
          pending={updateCity.isPending}
          onCancel={() => {
            setEditing(false);
          }}
          onSubmit={(input) => {
            setError(null);
            updateCity.mutate(input, {
              onSuccess: () => {
                setEditing(false);
              },
              onError: (err) => {
                setError(err instanceof ApiError ? err.message : 'Could not save.');
              },
            });
          }}
        />
        {error ? <p className="text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="font-medium text-neutral-900 dark:text-dark-text">{city.name}</p>
        <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">
          {city.timezone} · {city.userCount} users · {city.providerCount} providers
        </p>
        {error ? (
          <p className="mt-1 text-sm text-accent-700 dark:text-dark-accent">{error}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setEditing(true);
          }}
        >
          Edit
        </Button>
        <Button variant="danger" onClick={remove} disabled={deleteCity.isPending}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function CitiesSection() {
  const { data: cities, isLoading, isError } = useCities();
  const createCity = useCreateCity();
  const [creating, setCreating] = useState(false);

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-dark-border">
        <h2 className="font-semibold text-neutral-900 dark:text-dark-text">Cities</h2>
        {!creating ? (
          <Button
            variant="secondary"
            onClick={() => {
              setCreating(true);
            }}
          >
            Add city
          </Button>
        ) : null}
      </div>

      <div className="p-5 pb-0">
        {creating ? (
          <CityForm
            initial={EMPTY_CITY}
            pending={createCity.isPending}
            onCancel={() => {
              setCreating(false);
            }}
            onSubmit={(input) => {
              createCity.mutate(input, {
                onSuccess: () => {
                  setCreating(false);
                },
              });
            }}
          />
        ) : null}
      </div>

      {isLoading ? (
        <p className="px-5 pb-5 text-sm text-neutral-600 dark:text-dark-muted">Loading…</p>
      ) : null}
      {isError ? (
        <p className="px-5 pb-5 text-sm text-accent-700 dark:text-dark-accent">
          Couldn&apos;t load cities.
        </p>
      ) : null}

      <div className="divide-y divide-neutral-200 dark:divide-dark-border">
        {cities?.map((c) => (
          <CityRow key={c.id} city={c} />
        ))}
      </div>
    </Card>
  );
}

export function CatalogPage() {
  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-neutral-900 dark:text-dark-text">Catalog</h1>
      <CategoriesSection />
      <CitiesSection />
    </div>
  );
}
