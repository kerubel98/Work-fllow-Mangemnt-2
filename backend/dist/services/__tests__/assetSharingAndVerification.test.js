import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPostgresPool, connectPostgres, queryPg } from '../../config/postgres.js';
import { assetSharingService } from '../assetSharingService.js';
import { assetVerificationService } from '../assetVerificationService.js';
describe('Operational Asset Sharing, Hands-On Testing & Post-Approval Lock Suite', () => {
    const testTeamId = `team-share-test-${Date.now()}`;
    const makerUser = { id: `usr-maker-${Date.now()}`, name: 'Alice Maker' };
    const peerUser = { id: `usr-peer-${Date.now()}`, name: 'Bob Peer' };
    const checkerUser = { id: `usr-checker-${Date.now()}`, name: 'Charlie Checker' };
    let testBoxId = '';
    let testWorkflowId = '';
    beforeAll(async () => {
        await connectPostgres();
        // Seed test team
        await queryPg(`INSERT INTO teams (id, name, description, manager_id, manager_name) 
       VALUES ($1, 'Asset Test Team', 'Team for sharing test', 'mgr-1', 'Manager') 
       ON CONFLICT (id) DO NOTHING;`, [testTeamId]);
        // Seed a maker validation box
        testBoxId = `vbox-share-${Date.now()}`;
        await queryPg(`INSERT INTO validation_boxes (
        id, name, box_type, category, check_step, search_parameters,
        maker_id, maker_name, status, is_locked
      ) VALUES (
        $1, 'Card Settlement Auth Box', 'CONDITION_CHECK', 'SETTLEMENT',
        '{"operator": "EQUAL", "field": "status", "expected": "APPROVED"}',
        '["transaction_id", "terminal_id"]',
        $2, $3, 'DRAFT', false
      );`, [testBoxId, makerUser.id, makerUser.name]);
        // Seed a maker workflow DAG
        testWorkflowId = `wf-share-${Date.now()}`;
        await queryPg(`INSERT INTO database_validation_workflows (
        id, name, steps, stages, nodes, connections, maker_id, maker_name, status, is_locked
      ) VALUES (
        $1, 'Full Core Settlement Pipeline',
        '[{"id": "s1", "name": "Auth Log Check"}, {"id": "s2", "name": "Settlement Match"}]',
        '[]', '[]', '[]',
        $2, $3, 'DRAFT', false
      );`, [testWorkflowId, makerUser.id, makerUser.name]);
    }, 25000);
    it('1. Shares a validation box directly with a peer (Individual) with visual payload and zero approval friction', async () => {
        const share = await assetSharingService.shareAsset({
            assetType: 'VALIDATION_BOX',
            assetId: testBoxId,
            senderId: makerUser.id,
            senderName: makerUser.name,
            targetType: 'INDIVIDUAL',
            targetId: peerUser.id,
            targetName: peerUser.name,
            message: 'Take a look at this auth log validation box for the incident!'
        });
        expect(share.id).toBeDefined();
        expect(share.assetType).toBe('VALIDATION_BOX');
        expect(share.targetId).toBe(peerUser.id);
        expect(share.visualPayload.title).toBe('Card Settlement Auth Box');
        expect(share.visualPayload.category).toBe('SETTLEMENT');
        expect(share.visualPayload.searchParameters).toEqual(['transaction_id', 'terminal_id']);
    });
    it('2. Peer adopts the shared asset (1-Click "Add to My Workspace") as their own editable draft copy', async () => {
        const adoption = await assetSharingService.adoptAsset({
            assetType: 'VALIDATION_BOX',
            assetId: testBoxId,
            recipientId: peerUser.id,
            recipientName: peerUser.name
        });
        expect(adoption.newAssetId).toBeDefined();
        expect(adoption.newAssetId).not.toBe(testBoxId);
        expect(adoption.asset.maker_id).toBe(peerUser.id);
        expect(adoption.asset.status).toBe('DRAFT');
        expect(adoption.asset.is_locked).toBe(false);
        expect(adoption.asset.shared_source_id).toBe(testBoxId);
        expect(adoption.asset.name).toContain('(My Copy)');
    });
    it('3. Shares asset to Team Resource Center: transitions to PENDING_CHECKER_TEST', async () => {
        await assetSharingService.shareAsset({
            assetType: 'VALIDATION_BOX',
            assetId: testBoxId,
            senderId: makerUser.id,
            senderName: makerUser.name,
            targetType: 'TEAM',
            targetId: testTeamId,
            message: 'Submitting to team resource center for checker review'
        });
        const staged = await assetSharingService.getTeamStagedAssets(testTeamId);
        const stagedBox = staged.validationBoxes.find(b => b.id === testBoxId);
        expect(stagedBox).toBeDefined();
        expect(stagedBox?.status).toBe('PENDING_CHECKER_TEST');
        expect(stagedBox?.makerId).toBe(makerUser.id);
        expect(stagedBox?.isLocked).toBe(false);
    });
    it('4. Hands-On Checker Testing: Executes validation box against sample transactions in sandbox', async () => {
        const testResult = await assetVerificationService.testAssetAgainstTransactions({
            assetType: 'VALIDATION_BOX',
            assetId: testBoxId,
            checkerUser,
            sampleLimit: 5
        });
        expect(testResult.assetId).toBe(testBoxId);
        expect(testResult.testedByUserId).toBe(checkerUser.id);
        expect(testResult.totalTransactionsTested).toBeGreaterThanOrEqual(0);
        expect(testResult.durationMs).toBeGreaterThanOrEqual(0);
    });
    it('5. Enforces Anti-Self-Approval: Maker cannot approve their own asset', async () => {
        await expect(assetVerificationService.approveAsset({
            assetType: 'VALIDATION_BOX',
            assetId: testBoxId,
            checkerUser: makerUser // Alice Maker tries to approve her own box
        })).rejects.toThrow(/Anti-Self-Approval violation/);
    });
    it('6. Separate Checker approves asset: Status updates to APPROVED and is_locked becomes true', async () => {
        const approval = await assetVerificationService.approveAsset({
            assetType: 'VALIDATION_BOX',
            assetId: testBoxId,
            checkerUser,
            feedback: 'Tested against 10 sample transactions; all parameters valid.'
        });
        expect(approval.success).toBe(true);
        expect(approval.asset.status).toBe('APPROVED');
        expect(approval.asset.is_locked).toBe(true);
        expect(approval.asset.approved_by_user_id).toBe(checkerUser.id);
        expect(approval.asset.approved_by_user_name).toBe(checkerUser.name);
    });
    it('7. Post-Approval Edit Lock: Non-approving users are rejected from editing locked asset', async () => {
        // Peer tries to edit locked asset
        await expect(assetVerificationService.verifyEditPermission({
            assetType: 'VALIDATION_BOX',
            assetId: testBoxId,
            requestingUser: peerUser
        })).rejects.toThrow(/Permission Denied: Asset .* is locked/);
        // Approving Checker CAN edit or unlock
        const canCheckerEdit = await assetVerificationService.verifyEditPermission({
            assetType: 'VALIDATION_BOX',
            assetId: testBoxId,
            requestingUser: checkerUser
        });
        expect(canCheckerEdit).toBe(true);
    });
    it('8. Approving Checker unlocks the asset for revisions', async () => {
        const unlockRes = await assetVerificationService.unlockAsset({
            assetType: 'VALIDATION_BOX',
            assetId: testBoxId,
            requestingUser: checkerUser
        });
        expect(unlockRes.success).toBe(true);
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT is_locked FROM validation_boxes WHERE id = $1;', [testBoxId]);
        expect(rows[0].is_locked).toBe(false);
    });
    afterAll(async () => {
        try {
            await queryPg(`DELETE FROM asset_shares WHERE asset_id IN ($1, $2) OR sender_id = $3;`, [testBoxId, testWorkflowId, makerUser.id]);
            await queryPg(`DELETE FROM database_validation_workflows WHERE id = $1 OR shared_source_id = $1;`, [testWorkflowId]);
            await queryPg(`DELETE FROM validation_boxes WHERE id = $1 OR shared_source_id = $1;`, [testBoxId]);
            await queryPg(`DELETE FROM teams WHERE id = $1;`, [testTeamId]);
        }
        catch (err) {
            console.warn('Cleanup error in assetSharingAndVerification:', err.message);
        }
    });
});
