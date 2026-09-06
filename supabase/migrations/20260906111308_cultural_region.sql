alter table stories add column cultural_region text not null default 'english';
alter table chapters add column cultural_region text;
