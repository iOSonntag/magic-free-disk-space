declare const vagrantBoxNameBrand: unique symbol;

declare const vagrantBoxProviderBrand: unique symbol;

declare const vagrantBoxVersionBrand: unique symbol;

/** A box name `vagrant box list` gave, checked so it never reads as an option. */
export type VagrantBoxName = string & { [vagrantBoxNameBrand]: true };

/** A provider `vagrant box list` gave, such as `virtualbox`, checked so it never reads as an option. */
export type VagrantBoxProvider = string & { [vagrantBoxProviderBrand]: true };

/** A box version `vagrant box list` gave, checked so it never reads as an option. */
export type VagrantBoxVersion = string & { [vagrantBoxVersionBrand]: true };
