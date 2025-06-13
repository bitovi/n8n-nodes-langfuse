import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType
} from 'n8n-workflow';
import { Langfuse as LangfuseLib } from 'langfuse';

export class Langfuse implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Langfuse',
		name: 'langfuse',
		icon: 'file:langfuse.svg',
		group: ['transform'],
		version: 1,
		description: 'Log LLM input/output to Langfuse',
		defaults: {
			name: 'Langfuse',
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
						name: 'Log To Langfuse',
						value: 'logToLangfuse',
					},
				],
				default: 'logToLangfuse',
			},
			{
				displayName: 'LLM Input',
				name: 'llmInput',
				type: 'string',
				default: '',
				required: true,
				description: 'The input sent to the LLM',
			},
			{
				displayName: 'LLM Output',
				name: 'llmOutput',
				type: 'string',
				default: '',
				required: true,
				description: 'The output received from the LLM',
			},
		],
	};
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const input = this.getNodeParameter('llmInput', i) as string;
				const output = this.getNodeParameter('llmOutput', i) as string;
				const workflowName = this.getWorkflow().name as string;

				await logToLangfuse(input, output, workflowName);

				returnData.push({ json: { success: true, workflowName } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

async function logToLangfuse(input: string, output: string, workflowName: string) {
	try{	
		const workflowSlug = workflowName.trim().toLowerCase().replace(/\s+/g, '-');
		console.log("[Langfuse] Initializing Langfuse...");
		const langfuse = new LangfuseLib({
			publicKey: process.env.LANGFUSE_PUBLIC_KEY,
			secretKey: process.env.LANGFUSE_SECRET_KEY,
			baseUrl: process.env.LANGFUSE_HOST,
		});
		console.log("[Langfuse] Creating trace...");
		const trace = langfuse.trace({ name: `langfuse-test-${workflowSlug}-trace`, userId: 'n8n-manual-test' });
		await trace.update({ input, output, metadata: { workflowName: workflowName } });
		console.log("[Langfuse] Creating span...");
		const span = trace.span({ name: `langfuse-${workflowSlug}-inference`, metadata: { workflowName: workflowName } });
		await span.update({ input, output });
		await span.end();
		await langfuse.flush?.();
	}
	catch (error){
		console.error("[Langfuse] Error:", error);
		throw error;
	}
}
