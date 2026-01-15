# MVP Milestone Plan

## Overview

This plan delivers a **production-capable MVP from day 1** with proper backups, versioning, and restricted access. No overengineering, but production-appropriate from the start.

**Goal:** Replace Excel for 75k row dataset with automated calculations, no 1.5-hour load time.

**Timeline:** 4-6 weeks to production

---

## Milestone 1: Infrastructure Foundation (Week 1)

### Deliverables
- ✅ AWS infrastructure deployed (Terraform)
- ✅ RDS PostgreSQL with schema
- ✅ S3 bucket with versioning
- ✅ EC2 with Appsmith running
- ✅ Backups configured
- ✅ Monitoring baseline (CloudWatch)

### Tasks

**Day 1-2: AWS Setup**
- [ ] Create AWS account / use existing
- [ ] Configure AWS CLI credentials
- [ ] Create S3 bucket for Terraform state
- [ ] Generate Appsmith encryption secrets (store in password manager!)
- [ ] Create EC2 SSH key pair

**Day 3-4: Terraform Deployment**
- [ ] Configure `terraform.tfvars` with your values
- [ ] Run `terraform plan` and review
- [ ] Run `terraform apply`
- [ ] Save outputs (RDS endpoint, Appsmith IP)
- [ ] Verify all resources created

**Day 5: Database Initialization**
- [ ] Connect to RDS via psql
- [ ] Run `001_init.sql` (main schema)
- [ ] Run `002_staging_and_audit.sql` (staging + audit tables)
- [ ] Run `003_recalc_procedures.sql` (stored procedures)
- [ ] Verify: `\dt app.*` shows all tables

**Day 6-7: Lambda Deployment**
- [ ] Package Lambda functions (pip install + zip)
- [ ] Deploy import Lambda
- [ ] Deploy recalc Lambda
- [ ] Test manual invocation
- [ ] Verify CloudWatch logs

**Acceptance Criteria:**
- ✅ Can connect to RDS from Appsmith EC2
- ✅ Can access Appsmith UI via HTTPS
- ✅ Can invoke Lambda functions manually
- ✅ RDS automated backups enabled (7-day retention)
- ✅ S3 versioning enabled

**Risks & Mitigations:**
- **Risk:** Terraform apply fails due to resource limits
  - **Mitigation:** Request service limit increase for EC2/RDS
- **Risk:** Encryption secrets lost
  - **Mitigation:** Store in 2+ secure locations (password manager + secure doc)

---

## Milestone 2: Data Migration (Week 2)

### Deliverables
- ✅ Existing Excel data loaded into PostgreSQL
- ✅ Lista Programe imported
- ✅ Price list imported
- ✅ Data validated (row counts, spot checks)
- ✅ First successful recalculation

### Tasks

**Day 8-9: Data Preparation**
- [ ] Analyze existing Excel files (column mapping)
- [ ] Clean data (trim whitespace, normalize case)
- [ ] Identify join key quality issues
- [ ] Create column mapping documentation

**Day 10-11: Main Data Load**
- [ ] Write Python script: `scripts/initial_load.py`
- [ ] Load main_rows from "normare utilaje 2024"
- [ ] Verify row count (~75k rows)
- [ ] Spot-check critical records
- [ ] Create indexes (if not from schema)

**Day 12-13: Reference Data Import**
- [ ] Upload Lista Programe XLSX to S3
- [ ] Trigger import Lambda
- [ ] Verify: `SELECT COUNT(*) FROM lista_programe;` (~42k rows)
- [ ] Upload Price List (if separate file)
- [ ] Verify import success in `imports_audit`

**Day 14: First Recalculation**
- [ ] Manually trigger recalc Lambda
- [ ] Verify derived columns populated
- [ ] Check `recalc_runs` table for metrics
- [ ] Identify unmatched keys
- [ ] Document match rate (target: >90%)

**Acceptance Criteria:**
- ✅ main_rows count matches Excel row count (±1%)
- ✅ lista_programe count matches Excel
- ✅ Recalc completes in <30 seconds
- ✅ >90% of rows have derived columns populated
- ✅ Sample spot-checks validate correctness

**Risks & Mitigations:**
- **Risk:** Low match rate (<80%) due to inconsistent keys
  - **Mitigation:** Create mapping table for client/reper aliases
- **Risk:** Data corruption during import
  - **Mitigation:** Keep original Excel as source of truth, can re-import

---

## Milestone 3: Appsmith UI (Week 3)

### Deliverables
- ✅ Main Table page (editable grid with pagination)
- ✅ Reference Lists pages (read-only)
- ✅ Uploads page (XLSX import)
- ✅ Export page (download to Excel)
- ✅ User authentication configured

### Tasks

**Day 15-16: Datasource & Main Table**
- [ ] Configure PostgreSQL datasource in Appsmith
- [ ] Create "Main Table" page
- [ ] Add table widget with server-side pagination
- [ ] Implement search/filter
- [ ] Enable inline editing for editable columns
- [ ] Make derived columns read-only (gray background)
- [ ] Test: Edit cell → save → verify in DB

**Day 17-18: Reference Lists & Uploads**
- [ ] Create "Lista Programe" page (read-only table)
- [ ] Create "Price List" page (read-only table)
- [ ] Create "Uploads" page
- [ ] Add file uploader widget
- [ ] Implement S3 upload + Lambda trigger
- [ ] Add import history table
- [ ] Test: Upload XLSX → see success in history

**Day 19-20: Export & Recalc Control**
- [ ] Create "Export" page
- [ ] Implement filtered export to XLSX
- [ ] Create "Recalculation" page
- [ ] Add "Run Now" button → trigger Lambda
- [ ] Add recalc history table
- [ ] Add unmatched keys widget

**Day 21: Polish & Testing**
- [ ] Add navigation menu
- [ ] Add loading indicators
- [ ] Error handling for all operations
- [ ] Responsive design (desktop focus)
- [ ] User acceptance testing with 2-3 pilot users

**Acceptance Criteria:**
- ✅ Can view 75k rows with <2 sec page load
- ✅ Can edit and save cells successfully
- ✅ Can upload XLSX and see import complete
- ✅ Can export filtered data to Excel
- ✅ Derived columns clearly marked as read-only
- ✅ UI intuitive for Excel users (no training doc needed)

**Risks & Mitigations:**
- **Risk:** Performance issues with large table
  - **Mitigation:** Server-side pagination mandatory (50 rows/page)
- **Risk:** Users accidentally edit derived columns
  - **Mitigation:** Make read-only + visual indicator (background color)

---

## Milestone 4: Automation & Monitoring (Week 4)

### Deliverables
- ✅ Scheduled recalc (every 15 minutes)
- ✅ CloudWatch dashboards
- ✅ Alerting configured
- ✅ Backup automation
- ✅ Runbook documentation

### Tasks

**Day 22: Scheduled Recalc**
- [ ] EventBridge rule: `rate(15 minutes)`
- [ ] Verify Lambda invoked automatically
- [ ] Check CloudWatch logs
- [ ] Monitor for 24 hours
- [ ] Verify derived columns stay up-to-date

**Day 23: Monitoring**
- [ ] Create CloudWatch dashboard
- [ ] Add metrics: Lambda errors, RDS CPU, query duration
- [ ] Create alarms: Lambda errors, RDS storage >80%, EC2 disk >90%
- [ ] Configure SNS topic for alerts
- [ ] Test alarm (trigger Lambda error)

**Day 24: Backup Automation**
- [ ] Verify RDS automated backups (7-day retention)
- [ ] Create EBS snapshot lifecycle policy (Appsmith volume)
- [ ] Create cron job for Appsmith tar.gz backup to S3
- [ ] Test restore procedure (non-prod)

**Day 25: Documentation**
- [ ] Complete runbook (see `runbook.md`)
- [ ] Document common tasks (import, export, recalc)
- [ ] Document troubleshooting steps
- [ ] Create user guide (screenshots)

**Day 26-28: Testing & Refinement**
- [ ] Load testing (simulate 5 concurrent users)
- [ ] Failure testing (stop RDS, restart, verify recovery)
- [ ] Import bad XLSX (verify validation)
- [ ] Performance tuning (indexes, query optimization)

**Acceptance Criteria:**
- ✅ Recalc runs every 15 minutes without errors
- ✅ Alerts sent for Lambda errors (tested)
- ✅ Can restore from backup in <30 minutes
- ✅ Dashboard shows key metrics
- ✅ Runbook complete and tested

**Risks & Mitigations:**
- **Risk:** Frequent recalc causes DB load
  - **Mitigation:** Monitor RDS CPU; increase instance size if needed
- **Risk:** Alerts too noisy
  - **Mitigation:** Tune thresholds (2 consecutive errors vs 1)

---

## Milestone 5: Production Hardening (Week 5)

### Deliverables
- ✅ HTTPS with valid certificate
- ✅ IP whitelist enforced
- ✅ Multi-AZ RDS (if budget allows)
- ✅ CI/CD pipelines
- ✅ Security audit passed

### Tasks

**Day 29-30: HTTPS Setup**
- [ ] Option A: ALB + ACM certificate (if using domain)
- [ ] Option B: Let's Encrypt on EC2 (if using IP)
- [ ] Configure Nginx reverse proxy (if needed)
- [ ] Test HTTPS access
- [ ] Redirect HTTP → HTTPS

**Day 31: Security Hardening**
- [ ] Enforce IP whitelist (security groups)
- [ ] Remove default rules (0.0.0.0/0)
- [ ] Enable RDS encryption (already in Terraform)
- [ ] Enable CloudTrail (audit log for AWS API calls)
- [ ] Review IAM roles (least privilege)

**Day 32: CI/CD Setup**
- [ ] Configure GitHub Actions workflows
- [ ] Add GitHub Secrets (AWS creds, DB password)
- [ ] Test Terraform pipeline (PR → plan)
- [ ] Test Lambda deployment pipeline
- [ ] Document deployment process

**Day 33-34: Multi-AZ (Optional)**
- [ ] Enable RDS Multi-AZ (in `terraform.tfvars`)
- [ ] Run `terraform apply`
- [ ] Test failover (manually trigger in Console)
- [ ] Verify 1-2 min downtime during failover

**Day 35: Security Audit**
- [ ] Review S3 bucket policies (no public access)
- [ ] Review security group rules
- [ ] Review IAM policies
- [ ] Check for exposed secrets (scan repo)
- [ ] Document findings and remediations

**Acceptance Criteria:**
- ✅ HTTPS with valid certificate (no browser warning)
- ✅ Only whitelisted IPs can access Appsmith
- ✅ RDS in private subnet (no public endpoint)
- ✅ CI/CD pipelines working
- ✅ No security findings (high/critical)

**Risks & Mitigations:**
- **Risk:** Certificate renewal fails (Let's Encrypt)
  - **Mitigation:** Set up auto-renewal with certbot
- **Risk:** CI/CD breaks production
  - **Mitigation:** Manual approval step for prod deployments

---

## Milestone 6: User Acceptance & Go-Live (Week 6)

### Deliverables
- ✅ User training completed
- ✅ Parallel run with Excel (1 week)
- ✅ Go-live decision
- ✅ Excel deprecated

### Tasks

**Day 36-37: User Training**
- [ ] Create training materials (video walkthrough)
- [ ] Train 3-5 pilot users (1 hour session)
- [ ] Document feedback
- [ ] Quick fixes for usability issues

**Day 38-40: Parallel Run**
- [ ] Users update both Excel and PyramydalV2
- [ ] Daily comparison (spot-check 20 rows)
- [ ] Document discrepancies
- [ ] Fix data quality issues

**Day 41-42: Final Validation**
- [ ] Full data comparison (Excel vs PostgreSQL)
- [ ] Performance testing (all users accessing simultaneously)
- [ ] Disaster recovery drill
- [ ] Go/No-Go decision meeting

**Day 43: Go-Live**
- [ ] Announce Excel deprecation (effective immediately)
- [ ] Make Excel read-only (move to archive folder)
- [ ] Monitor closely for 24 hours
- [ ] On-call support for questions

**Acceptance Criteria:**
- ✅ <5% discrepancies between Excel and PostgreSQL
- ✅ All users trained and confident
- ✅ Performance acceptable under full load
- ✅ Disaster recovery procedure tested

**Risks & Mitigations:**
- **Risk:** Users resist change
  - **Mitigation:** Emphasize benefits (no 1.5-hour load time!), easy UI
- **Risk:** Data discrepancies found
  - **Mitigation:** Extend parallel run period, fix root cause

---

## Post-MVP Enhancements (Future)

### Phase 2 (Month 2-3)
- [ ] Advanced filtering (saved views)
- [ ] Bulk edit operations
- [ ] Audit trail viewer (see edit history)
- [ ] Real-time recalc on edit (no 15-min wait)
- [ ] Email notifications (import complete, errors)

### Phase 3 (Month 4-6)
- [ ] SSO integration (Google Workspace / Azure AD)
- [ ] Role-based permissions (view-only vs edit)
- [ ] Advanced analytics (charts, trends)
- [ ] Mobile-friendly view
- [ ] API endpoints for integrations

### Phase 4 (Month 7+)
- [ ] Machine learning for time estimates
- [ ] Workflow automation (status transitions)
- [ ] Integration with ERP system
- [ ] Multi-language support
- [ ] Advanced reporting

---

## Budget Estimate

### Initial Setup (One-time)
| Item | Cost |
|------|------|
| Development time (4-6 weeks) | Internal resource |
| AWS setup | $0 (free tier eligible) |
| Domain + SSL | $12/year (optional) |
| **Total** | **~$12** |

### Monthly Operating Costs
| Component | Cost |
|-----------|------|
| RDS PostgreSQL (db.t4g.small) | $35 |
| EC2 Appsmith (t3.medium) | $35 |
| EBS Storage (100 GB total) | $10 |
| S3 Storage (10 GB) | $0.25 |
| NAT Gateway | $35 |
| Lambda invocations (~5k/month) | $1 |
| Data transfer | $5 |
| **Total** | **~$120-150/month** |

*(Add ~$40/month for Multi-AZ RDS in production)*

**Cost Savings vs SaaS:**
- Retool/Appsmith Cloud: ~$50-100/user/month × 5 users = $250-500/month
- **Savings: $100-350/month** with self-hosted

---

## Success Metrics

### Performance
- ✅ Page load time: <2 seconds (vs 1.5 hours in Excel)
- ✅ Recalc duration: <30 seconds for 75k rows
- ✅ Uptime: >99.5% (target: 99.9%)

### Data Quality
- ✅ Match rate: >95% (rows with derived columns populated)
- ✅ Import success rate: >98%
- ✅ Data discrepancies: <1%

### User Adoption
- ✅ Daily active users: 100% of team
- ✅ Excel usage: 0% after go-live
- ✅ User satisfaction: >4/5 (survey)

### Reliability
- ✅ Mean time to recovery (MTTR): <30 minutes
- ✅ Data loss incidents: 0
- ✅ Backup success rate: 100%

---

## Go/No-Go Checklist

Before go-live, all must be ✅:

**Infrastructure**
- [ ] RDS automated backups enabled (7-day retention)
- [ ] S3 versioning enabled
- [ ] EBS snapshots configured
- [ ] CloudWatch alarms configured and tested

**Functionality**
- [ ] Main table loads <2 seconds
- [ ] Edit and save works reliably
- [ ] XLSX import validates and loads correctly
- [ ] Recalc updates derived columns
- [ ] Export produces correct Excel file

**Security**
- [ ] HTTPS enabled (valid certificate)
- [ ] IP whitelist enforced
- [ ] RDS in private subnet
- [ ] No public S3 access
- [ ] Secrets stored securely (not in code)

**Operations**
- [ ] Runbook complete and tested
- [ ] Backup restore procedure tested
- [ ] Monitoring dashboard accessible
- [ ] On-call person identified
- [ ] Emergency contacts documented

**Users**
- [ ] Training completed
- [ ] User guide available
- [ ] Parallel run successful
- [ ] Feedback incorporated

---

## Rollback Plan

If critical issues discovered post-go-live:

1. **Immediate:**
   - Switch users back to Excel (read-write)
   - Investigate issue in non-prod environment
   
2. **Within 24 hours:**
   - Fix root cause
   - Test fix thoroughly
   - Schedule re-launch

3. **Data sync:**
   - Export PostgreSQL changes during rollback period
   - Merge into Excel (or re-import to PostgreSQL after fix)

**Rollback triggers:**
- Data loss/corruption
- Sustained downtime (>4 hours)
- Security breach
- >50% of users cannot work

---

## Lessons Learned Template

After go-live, capture lessons learned:

**What went well:**
- ...

**What could be improved:**
- ...

**Technical debt:**
- ...

**Action items:**
- ...

---

## Conclusion

This MVP plan delivers a **production-capable system from day 1**, with proper:
- ✅ Backups (RDS, S3 versioning, EBS snapshots)
- ✅ Security (HTTPS, IP whitelist, private RDS)
- ✅ Monitoring (CloudWatch, alarms)
- ✅ Automation (scheduled recalc, CI/CD)
- ✅ Documentation (runbook, user guide)

**Key principle:** Keep it boring and reliable. No fancy tech, just solid engineering.

**Timeline:** 4-6 weeks from start to production.

**Cost:** ~$120-150/month (vs $1,800/year Excel frustration cost).

**ROI:** 1.5 hours saved per day × 5 users × $30/hour = $225/day = $5,500/month saved 🎉

