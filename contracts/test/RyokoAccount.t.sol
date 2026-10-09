// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {RyokoBase} from "./utils/RyokoBase.sol";
import {RyokoAccount} from "../src/RyokoAccount.sol";
import {RyokoJourney} from "../src/RyokoJourney.sol";

contract RyokoAccountTest is RyokoBase {
    RyokoAccount internal account;

    function setUp() public override {
        super.setUp();
        account = _start(alice, aliceChog);
    }

    function test_InterfaceIds_MatchEIP() public view {
        assertTrue(account.supportsInterface(0x01ffc9a7), "ERC-165");
        assertTrue(account.supportsInterface(0x6faff5f1), "IERC6551Account");
        assertTrue(account.supportsInterface(0x51945447), "IERC6551Executable");
        assertTrue(account.supportsInterface(0x1626ba7e), "ERC-1271");
        assertTrue(account.supportsInterface(0x150b7a02), "ERC721Receiver");
        assertTrue(account.supportsInterface(0x4e2312e0), "ERC1155Receiver");
        assertFalse(account.supportsInterface(0xffffffff));
    }

    function test_Owner_FollowsChog() public {
        assertEq(account.owner(), alice);
        vm.prank(alice);
        chog.transferFrom(alice, bob, aliceChog);
        assertEq(account.owner(), bob);
    }

    function test_Execute_HolderCanCallAnything() public {
        deal(address(token), address(account), 10 ether, true);
        uint256 stateBefore = account.state();
        vm.prank(alice);
        account.execute(address(token), 0, abi.encodeCall(IERC20.transfer, (bob, 4 ether)), 0);
        assertEq(token.balanceOf(bob), 4 ether);
        assertEq(account.state(), stateBefore + 1);
    }

    function test_Execute_SendsNativeValue() public {
        vm.deal(address(account), 1 ether);
        vm.prank(alice);
        account.execute(bob, 0.4 ether, "", 0);
        assertEq(bob.balance, 0.4 ether);
    }

    function test_Execute_RevertsForStranger() public {
        vm.prank(bob);
        vm.expectRevert(RyokoAccount.NotAuthorized.selector);
        account.execute(address(token), 0, "", 0);
    }

    function test_Execute_RejectsNonCallOperations() public {
        for (uint8 op = 1; op <= 3; ++op) {
            vm.prank(alice);
            vm.expectRevert(RyokoAccount.UnsupportedOperation.selector);
            account.execute(address(token), 0, "", op);
        }
    }

    function test_Execute_BubblesRevertData() public {
        vm.prank(alice);
        vm.expectRevert(RyokoJourney.NotInSwamp.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.conquer, ("x")), 0);
    }

    function test_Agent_CanOnlyCallJourney() public {
        _authorize(alice, account);
        deal(address(token), address(account), 10 ether, true);

        vm.prank(agentBot);
        vm.expectRevert(RyokoAccount.AgentTargetNotAllowed.selector);
        account.execute(address(token), 0, abi.encodeCall(IERC20.transfer, (agentBot, 1 ether)), 0);

        vm.deal(address(account), 1 ether);
        vm.prank(agentBot);
        vm.expectRevert(RyokoAccount.AgentTargetNotAllowed.selector);
        account.execute(address(journey), 1, abi.encodeCall(RyokoJourney.travel, ()), 0);

        vm.prank(agentBot);
        vm.expectRevert(RyokoAccount.AgentTargetNotAllowed.selector);
        account.execute(address(chog), 0, abi.encodeCall(IERC721.approve, (agentBot, aliceChog)), 0);
    }

    function test_Agent_CannotChangeAuthorization() public {
        _authorize(alice, account);
        vm.prank(agentBot);
        vm.expectRevert(RyokoAccount.NotAuthorized.selector);
        account.authorize(agentBot, IERC20(address(token)), type(uint256).max);
    }

    function test_Authorize_SetsAgentAndAllowance() public {
        vm.expectEmit(true, true, false, false, address(account));
        emit RyokoAccount.AgentSet(agentBot, alice);
        _authorize(alice, account);
        assertEq(account.agent(), agentBot);
        assertEq(token.allowance(address(account), address(journey)), type(uint256).max);
    }

    function test_Authorize_RevokeWithZero() public {
        _authorize(alice, account);
        vm.prank(alice);
        account.authorize(address(0), IERC20(address(token)), 0);
        assertEq(account.agent(), address(0));
        assertEq(token.allowance(address(account), address(journey)), 0);
        vm.prank(agentBot);
        vm.expectRevert(RyokoAccount.NotAuthorized.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);
    }

    function test_Authorize_OnlyHolder() public {
        vm.prank(bob);
        vm.expectRevert(RyokoAccount.NotAuthorized.selector);
        account.authorize(bob, IERC20(address(0)), 0);
    }

    function test_Agent_ExpiresOnTransferAndDoesNotComeBack() public {
        _authorize(alice, account);
        vm.prank(alice);
        chog.transferFrom(alice, bob, aliceChog);
        assertEq(account.agent(), address(0));
        vm.prank(bob);
        chog.transferFrom(bob, alice, aliceChog);
        // Grant was made by alice, alice holds again: the grant is alice's own and stays valid.
        assertEq(account.agent(), agentBot);
        // A grant made by bob does not survive the Chog returning to alice.
        vm.prank(alice);
        chog.transferFrom(alice, bob, aliceChog);
        vm.prank(bob);
        account.authorize(bob, IERC20(address(0)), 0);
        vm.prank(bob);
        chog.transferFrom(bob, alice, aliceChog);
        assertEq(account.agent(), address(0));
    }

    function test_IsValidSigner() public view {
        assertEq(account.isValidSigner(alice, ""), bytes4(0x523e3260));
        assertEq(account.isValidSigner(bob, ""), bytes4(0));
        assertEq(account.isValidSigner(address(0), ""), bytes4(0));
    }

    function test_IsValidSignature_HolderOnly() public {
        bytes32 hash = MessageHashUtils.toEthSignedMessageHash(keccak256("ryoko"));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, hash);
        assertEq(account.isValidSignature(hash, abi.encodePacked(r, s, v)), bytes4(0x1626ba7e));

        (, uint256 bobKey) = makeAddrAndKey("bob-signer");
        (v, r, s) = vm.sign(bobKey, hash);
        assertEq(account.isValidSignature(hash, abi.encodePacked(r, s, v)), bytes4(0xffffffff));
    }

    function test_OwnershipCycle_SafeTransferRejected() public {
        vm.prank(alice);
        vm.expectRevert(RyokoAccount.OwnershipCycle.selector);
        chog.safeTransferFrom(alice, address(account), aliceChog);
    }

    function test_OwnershipCycle_ExecuteGuard() public {
        vm.prank(alice);
        chog.setApprovalForAll(address(account), true);
        vm.prank(alice);
        vm.expectRevert(RyokoAccount.OwnershipCycle.selector);
        account.execute(
            address(chog), 0, abi.encodeCall(IERC721.transferFrom, (alice, address(account), aliceChog)), 0
        );
        assertEq(chog.ownerOf(aliceChog), alice);
    }

    function test_ReceivesOtherNftsAndNative() public {
        vm.prank(bob);
        uint256 other = chog.mint();
        vm.prank(bob);
        chog.safeTransferFrom(bob, address(account), other);
        assertEq(chog.ownerOf(other), address(account));

        vm.deal(bob, 1 ether);
        vm.prank(bob);
        (bool ok,) = address(account).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(account).balance, 1 ether);
    }

    function test_Implementation_HasNoOwner() public view {
        assertEq(impl.owner(), address(0));
        assertEq(impl.agent(), address(0));
    }
}
