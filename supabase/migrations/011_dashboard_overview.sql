-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

-- Executive overview dashboard: one round trip instead of N+1 queries from
-- the app. Aggregates across all 3 send sources (campaign, gửi thử, API
-- ngoài) since Zalo charges for all 3 the same way. Cost is computed from
-- zalo_templates.price_sdt/price_uid, matched by the Zalo template_id text
-- (campaign_recipients only has the internal uuid via campaigns.template_id;
-- api_send_log/test_send_log already store the Zalo template_id text).
create or replace function public.dashboard_overview(days_back int default null)
returns jsonb
language plpgsql
stable
as $$
declare
  cutoff timestamptz := case when days_back is null then '-infinity'::timestamptz
                              else now() - (days_back || ' days')::interval end;
  result jsonb;
begin
  with camp_recipients as (
    select
      cr.campaign_id,
      cr.customer_id,
      cr.status,
      cr.send_mode,
      case
        when cr.status = 'sent' and cr.send_mode = 'phone' then coalesce(zt.price_sdt, 0)
        when cr.status = 'sent' and cr.send_mode = 'uid' then coalesce(zt.price_uid, 0)
        else 0
      end as cost
    from public.campaign_recipients cr
    join public.campaigns c on c.id = cr.campaign_id
    join public.zalo_templates zt on zt.id = c.template_id
    where coalesce(cr.sent_at, cr.created_at) >= cutoff
  ),
  by_campaign as (
    select
      c.id,
      c.name,
      c.status,
      count(*) filter (where cr.status = 'sent') as sent,
      count(*) filter (where cr.status = 'failed') as failed,
      count(*) filter (where cr.status = 'pending') as pending,
      coalesce(sum(cr.cost), 0) as cost
    from public.campaigns c
    left join camp_recipients cr on cr.campaign_id = c.id
    group by c.id, c.name, c.status
  ),
  by_channel as (
    select
      send_mode,
      count(*) filter (where status = 'sent') as sent,
      coalesce(sum(cost), 0) as cost
    from camp_recipients
    group by send_mode
  ),
  api_rows as (
    select
      asl.success,
      case when asl.success then
        case when asl.send_mode = 'phone' then coalesce(zt.price_sdt, 0) else coalesce(zt.price_uid, 0) end
      else 0 end as cost
    from public.api_send_log asl
    left join public.zalo_templates zt on zt.template_id = asl.template_id
    where asl.created_at >= cutoff
  ),
  test_rows as (
    select
      tsl.success,
      case when tsl.success then
        case when tsl.send_mode = 'phone' then coalesce(zt.price_sdt, 0) else coalesce(zt.price_uid, 0) end
      else 0 end as cost
    from public.test_send_log tsl
    left join public.zalo_templates zt on zt.template_id = tsl.template_id
    where tsl.created_at >= cutoff
  ),
  top_customers as (
    select
      cust.id,
      cust.name,
      cust.phone,
      count(*) as message_count
    from public.campaign_recipients cr
    join public.customers cust on cust.id = cr.customer_id
    where cr.status = 'sent' and coalesce(cr.sent_at, cr.created_at) >= cutoff
    group by cust.id, cust.name, cust.phone
    order by count(*) desc
    limit 10
  )
  select jsonb_build_object(
    'byCampaign',
      (select coalesce(jsonb_agg(row_to_json(bc.*) order by (bc.sent + bc.failed) desc), '[]'::jsonb)
       from by_campaign bc),
    'byChannel',
      (select coalesce(jsonb_agg(row_to_json(ch.*)), '[]'::jsonb) from by_channel ch),
    'topCustomers',
      (select coalesce(jsonb_agg(row_to_json(tc.*)), '[]'::jsonb) from top_customers tc),
    'totals', jsonb_build_object(
      'campaignCount', (select count(*) from public.campaigns),
      'campaignSent', (select coalesce(sum(sent), 0) from by_campaign),
      'campaignFailed', (select coalesce(sum(failed), 0) from by_campaign),
      'campaignPending', (select coalesce(sum(pending), 0) from by_campaign),
      'campaignCost', (select coalesce(sum(cost), 0) from by_campaign),
      'apiSent', (select count(*) from api_rows where success),
      'apiFailed', (select count(*) from api_rows where not success),
      'apiCost', (select coalesce(sum(cost), 0) from api_rows),
      'testSent', (select count(*) from test_rows where success),
      'testFailed', (select count(*) from test_rows where not success),
      'testCost', (select coalesce(sum(cost), 0) from test_rows)
    )
  ) into result;

  return result;
end;
$$;
