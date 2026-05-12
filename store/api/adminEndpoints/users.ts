import { adminApi } from '../adminApi';

export interface UserCompanyAccessItem {
  userId: string;
  companyId: string;
  roleId: string;
  role?: { id: string; name: string; permissions: string[] };
  company?: { id: string; name: string; slug: string };
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  image?: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  activeCompanyId?: string;
  /** When set, this login is the employee self-service portal user for HR. */
  linkedEmployeeId?: string | null;
  companyAccess?: UserCompanyAccessItem[];
  createdAt: string | Date;
  updatedAt?: string | Date;
}

function applyUserDraftPatch(row: User, data: Partial<User> & Record<string, unknown>) {
  if (data.name !== undefined) row.name = data.name as string;
  if (data.isSuperAdmin !== undefined) row.isSuperAdmin = data.isSuperAdmin as boolean;
  if (data.isActive !== undefined) row.isActive = data.isActive as boolean;
  if (data.companyAccess !== undefined) {
    row.companyAccess = data.companyAccess as User['companyAccess'];
  }
}

export const usersApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<User[], void>({
      query: () => '/users',
      transformResponse: (r: { data: User[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'User', id: 'LIST' }, ...result.map((user) => ({ type: 'User' as const, id: user.id }))]
          : [{ type: 'User', id: 'LIST' }],
    }),

    createUser: builder.mutation<User, Partial<User> & { password: string }>({
      query: (body) => ({
        url: '/users',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: User }) => r.data,
      invalidatesTags: [],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data: created } = await queryFulfilled;
          dispatch(
            adminApi.util.updateQueryData('getUsers', undefined, (draft) => {
              if (!draft.some((u) => u.id === created.id)) draft.unshift(created);
            }),
          );
        } catch {
          /* mutation failed — no cache change */
        }
      },
    }),

    updateUser: builder.mutation<User, { id: string; data: Partial<User> }>({
      query: ({ id, data }) => ({
        url: `/users/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: User }) => r.data,
      invalidatesTags: [],
      async onQueryStarted({ id, data }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          adminApi.util.updateQueryData('getUsers', undefined, (draft) => {
            const row = draft.find((u) => u.id === id);
            if (row) applyUserDraftPatch(row, data);
          }),
        );
        try {
          const { data: serverUser } = await queryFulfilled;
          dispatch(
            adminApi.util.updateQueryData('getUsers', undefined, (draft) => {
              const idx = draft.findIndex((u) => u.id === id);
              if (idx !== -1) draft[idx] = serverUser;
            }),
          );
        } catch {
          patch.undo();
        }
      },
    }),
  }),
});

export const { useGetUsersQuery, useCreateUserMutation, useUpdateUserMutation } = usersApi;
