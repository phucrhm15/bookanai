CREATE TABLE `users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`circle_wallet_id` text NOT NULL,
	`address` text NOT NULL,
	`ledger_balance_micro_usdc` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_circle_wallet_id_uidx` ON `users` (`circle_wallet_id`);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`amount_micro_usdc` integer NOT NULL,
	`agent_id` text,
	`idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ledger_entries_user_id_idx` ON `ledger_entries` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_idempotency_uidx` ON `ledger_entries` (`idempotency_key`);
--> statement-breakpoint
CREATE TABLE `settlement_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `pending_onchain_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`circle_wallet_id` text NOT NULL,
	`amount_micro_usdc` integer NOT NULL,
	`target_chain_id` integer NOT NULL,
	`batch_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`circle_transaction_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`batch_id`) REFERENCES `settlement_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_settlements_ledger_entry_uidx` ON `pending_onchain_settlements` (`ledger_entry_id`);
--> statement-breakpoint
CREATE INDEX `pending_settlements_status_idx` ON `pending_onchain_settlements` (`status`);
--> statement-breakpoint
CREATE INDEX `pending_settlements_batch_id_idx` ON `pending_onchain_settlements` (`batch_id`);
