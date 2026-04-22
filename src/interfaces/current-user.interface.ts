export interface CurrentUser {
  id: string;
  email?: string;
  phoneNumber?: string;
  phone?: string;
  roles: string[];
  permissions: string[];
  role?: string;
  scope?: string;
  merchantProfilesId?: string;
  isFirstTime?: boolean;
}
