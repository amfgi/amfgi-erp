import { adminApi } from '../adminApi';

export interface CompanyProfile {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export const profilesApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getCompanyProfiles: builder.query<CompanyProfile[], void>({
      query: () => '/company-profiles',
      transformResponse: (r: { data: CompanyProfile[] }) => r.data,
      providesTags: [{ type: 'CompanyProfile', id: 'LIST' }],
    }),

    createCompanyProfile: builder.mutation<CompanyProfile, Partial<CompanyProfile>>({
      query: (body) => ({
        url: '/company-profiles',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: CompanyProfile }) => r.data,
      invalidatesTags: [],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data: created } = await queryFulfilled;
          dispatch(
            adminApi.util.updateQueryData('getCompanyProfiles', undefined, (draft) => {
              if (!draft.some((p) => p.id === created.id)) draft.unshift(created);
            }),
          );
        } catch {
          /* no-op */
        }
      },
    }),
  }),
});

export const { useGetCompanyProfilesQuery, useCreateCompanyProfileMutation } = profilesApi;
