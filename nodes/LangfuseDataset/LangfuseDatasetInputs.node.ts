import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
} from 'n8n-workflow';
import { Langfuse as LangfuseCreate } from 'langfuse';

const LOG_NAME = 'LangfuseDatasetInputs';

export class LangfuseDatasetInputs implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Dataset Inputs',
		name: 'langfuseDatasetInputs',
		icon: 'file:langfuse.svg',
		group: ['transform'],
		version: 1,
		description: "Grab specific workflow's Langfuse dataset inputs to run",
		defaults: {
			name: 'LangfuseDatasetInputs',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'Action',
				name: 'action',
				type: 'options',
				options: [
					{
						name: 'Langfuse Dataset Inputs',
						value: 'langfuseDatasetInputs',
					},
				],
				default: 'langfuseDatasetInputs',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		var returnData: INodeExecutionData[] = [];

		try {
			const workflowName = this.getWorkflow().name as string;

			console.log(`[${LOG_NAME}] Initializing Langfuse...`);
			const langfuse = new LangfuseCreate({
				publicKey: process.env.LANGFUSE_PUBLIC_KEY,
				secretKey: process.env.LANGFUSE_SECRET_KEY,
				baseUrl: process.env.LANGFUSE_HOST,
			});

			returnData = await getDatasetInputs(this, langfuse, workflowName);

			console.log(`[${LOG_NAME}] Flushing Langfuse...`);
			await langfuse.flushAsync();
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: {
						error: error.message,
					},
				});
			} else {
				throw error;
			}
		}
		return [returnData];
	}
}

async function getDatasetInputs(
	executeFuncs: IExecuteFunctions,
	langfuse: LangfuseCreate,
	workflowName: string,
) {
	const returnInputs: INodeExecutionData[] = [];

	try {
		var runName = "";
		const workflowSlug = workflowName.trim().toLowerCase().replace(/\s+/g, '-');

		console.log(`[${LOG_NAME}] Gathering ${workflowName} workflow's dataset inputs...`);
		const dataset = await langfuse.getDataset(`dataset-${workflowSlug}`);
		if (!dataset) {
			console.log(`[${LOG_NAME}] Dataset for ${workflowName} workflow does not exist`);
		} else {
			console.log(`[${LOG_NAME}] Dataset ${dataset.name} gathered.`);
			console.log(`[${LOG_NAME}] Creating dataset run name...`);
			runName = `experiment-${workflowSlug}-${Date.now()}`;
		}
		if (!dataset.items) {
			console.log(`[${LOG_NAME}] Dataset Items for ${workflowName} workflow do not exist`);
		} else {
			for (const itemRaw of dataset.items) {
				const item = itemRaw as any; //avoid type issues in returnInputs
				if (item.status == 'ACTIVE') {
					console.log(`[${LOG_NAME}] Retrieved ${item.status} Dataset Item: ${item.id}`);
					console.log(`[${LOG_NAME}] Creating Dataset Item Trace...`);
					const startTime = new Date().toISOString();
					const itemTrace = langfuse.trace({
						name: `trace-dataset-run-${workflowSlug}`,
						userId: 'n8n-dataset-run-test',
						input: item.input,
						metadata: { 
							startTime: startTime,
							itemId: item.id,
							runName: runName,
							workflowName: workflowName 
						}
					});
					await item.link(itemTrace, runName, {
						description: `Dataset ${dataset.name} for ${workflowName} workflow`,
					});
					console.log(`[${LOG_NAME}] Creating Dataset Item Trace Span...`);
					const itemSpan = itemTrace.span({
						name: `span-dataset-run-${item.id}`,
						input: item.input,
						metadata: { 
							startTime: startTime,
							itemId: item.id,
							runName: runName,
							workflowName: workflowName 
						}
					});
					returnInputs.push({ json: { input: item.input, itemId: item.id, traceId: itemTrace.traceId, spanId: itemSpan.id, runName: runName } });
				} else {
					console.log(`[${LOG_NAME}] Dataset Item ${item.id} is ${item.status}`);
				}
			}
		}
	} catch (error) {
		if (error.message.includes('not found') || error.status === 404) {
			console.error(`[${LOG_NAME}] Dataset for ${workflowName} workflow does not exist`);
			// create new? create a defaut LLM dataset to use?
			returnInputs.push({
				json: {
					error: `Dataset for ${workflowName} workflow does not exist`,
				},
			});
		} else {
			if (executeFuncs.continueOnFail()) {
				returnInputs.push({
					json: {
						error: error.message,
					},
				});
			} else {
				console.error(`[${LOG_NAME}] Error: ${error}`);
				throw error;
			}
		}
	}

	return returnInputs;
}
