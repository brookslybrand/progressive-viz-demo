import type { LoaderFunction, ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  useCatch,
  useFetcher,
  useLoaderData,
  useParams,
} from "@remix-run/react";
import { inputClasses, LabelText, submitButtonClasses } from "~/components";
import { getInvoiceDetails } from "~/models/invoice.server";
import type { LineItem, DueStatus } from "~/models/invoice.server";
import { requireUser } from "~/session.server";
import { currencyFormatter, parseDate } from "~/utils";
import type { Deposit } from "~/models/deposit.server";
import { createDeposit } from "~/models/deposit.server";
import invariant from "tiny-invariant";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { scaleTime, scaleLinear } from "d3-scale";
import { curveBasis, line } from "d3-shape";
import { interpolatePath } from "d3-interpolate-path";
import { assign, createMachine } from "xstate";
import { useMachine } from "@xstate/react";
import { send } from "process";

type LoaderData = {
  customerName: string;
  customerId: string;
  totalAmount: number;
  dueStatus: DueStatus;
  dueDisplay: string;
  invoiceDateDisplay: string;
  lineItems: Array<
    Pick<LineItem, "id" | "quantity" | "unitPrice" | "description">
  >;
  deposits: Array<
    Pick<Deposit, "id" | "amount"> & { depositDateFormatted: string }
  >;
};

export const loader: LoaderFunction = async ({ request, params }) => {
  await requireUser(request);
  const { invoiceId } = params;
  if (typeof invoiceId !== "string") {
    throw new Error("This should be unpossible.");
  }
  const invoiceDetails = await getInvoiceDetails(invoiceId);
  if (!invoiceDetails) {
    throw new Response("not found", { status: 404 });
  }
  return json<LoaderData>({
    customerName: invoiceDetails.invoice.customer.name,
    customerId: invoiceDetails.invoice.customer.id,
    totalAmount: invoiceDetails.totalAmount,
    dueStatus: invoiceDetails.dueStatus,
    dueDisplay: invoiceDetails.dueStatusDisplay,
    invoiceDateDisplay: invoiceDetails.invoice.invoiceDate.toLocaleDateString(),
    lineItems: invoiceDetails.invoice.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
    })),
    deposits: invoiceDetails.invoice.deposits.map((deposit) => ({
      id: deposit.id,
      amount: deposit.amount,
      depositDateFormatted: deposit.depositDate.toLocaleDateString(),
    })),
  });
};

type ActionData = {
  errors: {
    amount: string | null;
    depositDate: string | null;
  };
};

function validateAmount(amount: number) {
  if (amount <= 0) return "Must be greater than 0";
  if (Number(amount.toFixed(2)) !== amount) {
    return "Must only have two decimal places";
  }
  return null;
}

function validateDepositDate(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return "Please enter a valid date";
  }
  return null;
}

export const action: ActionFunction = async ({ request, params }) => {
  await requireUser(request);
  const { invoiceId } = params;
  if (typeof invoiceId !== "string") {
    throw new Error("This should be unpossible.");
  }
  const formData = await request.formData();
  const intent = formData.get("intent");
  invariant(typeof intent === "string", "intent required");
  switch (intent) {
    case "create-deposit": {
      const amount = Number(formData.get("amount"));
      const depositDateString = formData.get("depositDate");
      const note = formData.get("note");
      invariant(!Number.isNaN(amount), "amount must be a number");
      invariant(typeof depositDateString === "string", "dueDate is required");
      invariant(typeof note === "string", "dueDate is required");
      const depositDate = parseDate(depositDateString);

      const errors: ActionData["errors"] = {
        amount: validateAmount(amount),
        depositDate: validateDepositDate(depositDate),
      };
      const hasErrors = Object.values(errors).some(
        (errorMessage) => errorMessage
      );
      if (hasErrors) {
        return json<ActionData>({ errors });
      }

      await createDeposit({ invoiceId, amount, note, depositDate });
      return new Response("ok");
    }
    default: {
      throw new Error(`Unsupported intent: ${intent}`);
    }
  }
};

const lineItemClassName =
  "flex justify-between border-t border-gray-100 py-4 text-[14px] leading-[24px]";
export default function InvoiceRoute() {
  const data = useLoaderData() as LoaderData;

  return (
    <div className="relative p-10">
      <Link
        to={`../../customers/${data.customerId}`}
        className="text-[length:14px] font-bold leading-6 text-blue-600 underline"
      >
        {data.customerName}
      </Link>
      <div className="text-[length:32px] font-bold leading-[40px]">
        {currencyFormatter.format(data.totalAmount)}
      </div>
      <LabelText>
        <span
          className={
            data.dueStatus === "paid"
              ? "text-green-brand"
              : data.dueStatus === "overdue"
              ? "text-red-brand"
              : ""
          }
        >
          {data.dueDisplay}
        </span>
        {` • Invoiced ${data.invoiceDateDisplay}`}
      </LabelText>
      <div className="h-4" />
      {data.lineItems.map((item) => (
        <LineItemDisplay
          key={item.id}
          description={item.description}
          unitPrice={item.unitPrice}
          quantity={item.quantity}
        />
      ))}
      <div className={`${lineItemClassName} font-bold`}>
        <div>Net Total</div>
        <div>{currencyFormatter.format(data.totalAmount)}</div>
      </div>
      <div className="h-8" />
      <Deposits />
    </div>
  );
}

interface DepositFormControlsCollection extends HTMLFormControlsCollection {
  amount?: HTMLInputElement;
  depositDate?: HTMLInputElement;
  note?: HTMLInputElement;
  intent?: HTMLButtonElement;
}
interface DepositFormElement extends HTMLFormElement {
  readonly elements: DepositFormControlsCollection;
}

function Deposits() {
  const data = useLoaderData() as LoaderData;
  const newDepositFetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);

  const deposits = [...data.deposits];

  if (newDepositFetcher.submission) {
    const amount = Number(newDepositFetcher.submission.formData.get("amount"));
    const depositDateVal =
      newDepositFetcher.submission.formData.get("depositDate");
    const depositDate =
      typeof depositDateVal === "string" ? parseDate(depositDateVal) : null;
    if (
      !validateAmount(amount) &&
      depositDate &&
      !validateDepositDate(depositDate)
    ) {
      deposits.push({
        id: "new",
        amount,
        depositDateFormatted: depositDate.toLocaleDateString(),
      });
    }
  }

  const errors = newDepositFetcher.data?.errors as
    | ActionData["errors"]
    | undefined;

  useEffect(() => {
    if (!formRef.current) return;
    if (newDepositFetcher.type !== "done") return;

    const formEl = formRef.current as DepositFormElement;

    if (errors?.amount) {
      formEl.elements.amount?.focus();
    } else if (errors?.depositDate) {
      formEl.elements.depositDate?.focus();
    } else if (document.activeElement === formEl.elements.intent) {
      formEl.reset();
      formEl.elements.amount?.focus();
    }
  }, [newDepositFetcher.type, errors]);

  return (
    <div>
      <div className="font-bold leading-8">Deposits</div>
      {deposits.length > 0 ? (
        <div>
          {deposits.length > 1 ? (
            <DepositLineChart deposits={deposits} />
          ) : null}
          {deposits.map((deposit) => (
            <div key={deposit.id} className={lineItemClassName}>
              <Link
                to={`../../deposits/${deposit.id}`}
                className="text-blue-600 underline"
              >
                {deposit.depositDateFormatted}
              </Link>
              <div>{currencyFormatter.format(deposit.amount)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div>None yet</div>
      )}
      <newDepositFetcher.Form
        method="post"
        className="grid grid-cols-1 gap-x-4 gap-y-2 lg:grid-cols-2"
        ref={formRef}
        noValidate
      >
        <div className="min-w-[100px]">
          <div className="flex flex-wrap items-center gap-1">
            <LabelText>
              <label htmlFor="depositAmount">Amount</label>
            </LabelText>
            {errors?.amount ? (
              <em id="amount-error" className="text-d-p-xs text-red-600">
                {errors.amount}
              </em>
            ) : null}
          </div>
          <input
            id="depositAmount"
            name="amount"
            type="number"
            className={inputClasses}
            min="0.01"
            step="any"
            required
            aria-invalid={Boolean(errors?.amount) || undefined}
            aria-errormessage={errors?.amount ? "amount-error" : undefined}
          />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-1">
            <LabelText>
              <label htmlFor="depositDate">Date</label>
            </LabelText>
            {errors?.depositDate ? (
              <em id="depositDate-error" className="text-d-p-xs text-red-600">
                {errors.depositDate}
              </em>
            ) : null}
          </div>
          <input
            id="depositDate"
            name="depositDate"
            type="date"
            className={`${inputClasses} h-[34px]`}
            required
            aria-invalid={Boolean(errors?.depositDate) || undefined}
            aria-errormessage={
              errors?.depositDate ? "depositDate-error" : undefined
            }
          />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:col-span-2 lg:flex">
          <div className="flex-1">
            <LabelText>
              <label htmlFor="depositNote">Note</label>
            </LabelText>
            <input
              id="depositNote"
              name="note"
              type="text"
              className={inputClasses}
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className={submitButtonClasses}
              name="intent"
              value="create-deposit"
            >
              Create
            </button>
          </div>
        </div>
      </newDepositFetcher.Form>
    </div>
  );
}

type DepositLineChartProps = {
  deposits: LoaderData["deposits"];
};

function DepositLineChart({ deposits }: DepositLineChartProps) {
  const width = 400;
  const height = 200;
  const margin = { top: 10, right: 0, bottom: 18, left: 0 };

  const dateAmountMap = new Map<number, number>();
  for (const { depositDateFormatted, amount } of deposits) {
    const date = new Date(depositDateFormatted).valueOf();
    const currentAmount = dateAmountMap.get(date) ?? 0;
    dateAmountMap.set(date, currentAmount + amount);
  }

  const dates = [...dateAmountMap.keys()].sort((d1, d2) => d1 - d2);

  let cumulativeAmount = 0;
  const data = dates.map((date) => {
    cumulativeAmount += dateAmountMap.get(date) ?? 0;
    return { x: date, y: cumulativeAmount };
  });

  const firstEntry = data[0];
  const lastEntry = data[data.length - 1];

  const xScale = scaleTime()
    .domain([firstEntry.x, lastEntry.x])
    .range([margin.left, width - margin.right]);

  const yScale = scaleLinear()
    .domain([firstEntry.y, cumulativeAmount])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const lineGenerator = line<{ x: number; y: number }>()
    .x((d) => xScale(d.x))
    .y((d) => yScale(d.y))
    .curve(curveBasis);

  const d = lineGenerator(data);
  if (d === null) {
    throw new Error(
      `Something went wrong: line generation failed with data ${data}`
    );
  }
  const dPath = useDPathAnimationMachine(d);

  return (
    <svg
      width={width + margin.left + margin.right}
      height={height + margin.top + margin.bottom}
    >
      <g transform={`translate(${margin.left},${margin.top})`}>
        <path className="fill-transparent stroke-blue-300 stroke-2" d={dPath} />
      </g>
      {/* first date */}
      <text
        alignmentBaseline="hanging"
        className="fill-gray-600"
        x={xScale(firstEntry.x)}
        y={height + 5}
      >
        {new Date(firstEntry.x).toLocaleDateString()}
      </text>
      {/* last date */}
      <text
        textAnchor="end"
        alignmentBaseline="hanging"
        className="fill-gray-600"
        x={xScale(lastEntry.x)}
        y={height + 5}
      >
        {new Date(lastEntry.x).toLocaleDateString()}
      </text>
      {/* first number */}
      <text
        className="fill-green-600"
        x={xScale(firstEntry.x)}
        y={yScale(firstEntry.y)}
      >
        ${firstEntry.y}
      </text>
      {/* final number */}
      <text
        className="fill-green-600"
        textAnchor="end"
        x={xScale(lastEntry.x)}
        y={yScale(lastEntry.y)}
      >
        ${lastEntry.y}
      </text>
    </svg>
  );
}

const animationMachine = createMachine(
  {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    tsTypes: {} as import("./$invoiceId.typegen").Typegen0,
    schema: {
      context: {} as {
        intermediateDPath: string;
        nextDPath: string;
        pathInterpolator: (t: number) => string;
        rate: number;
        t: number;
      },
      events: {} as
        | { type: "startAnimation"; nextDPath: string }
        | { type: "tick" },
    },
    id: "animationMachine",
    initial: "waiting",
    context: {
      intermediateDPath: "",
      nextDPath: "",
      pathInterpolator: (t: number) => "",
      rate: 0,
      t: 0,
    },
    states: {
      waiting: {
        on: {
          startAnimation: {
            target: "transitioning",
            actions: ["setupNewAnimation"],
            cond: "isDPathDifferent",
          },
        },
      },
      transitioning: {
        invoke: {
          src: "animationLoop",
        },
        on: {
          tick: [
            {
              target: "waiting",
              cond: "isAnimationFinished",
            },
            {
              actions: ["updateIntermediateDPath"],
            },
          ],
          startAnimation: {
            target: "transitioning",
            actions: ["setupInterruptedAnimation"],
            cond: "isDPathDifferent",
          },
        },
      },
    },
  },
  {
    actions: {
      setupNewAnimation: assign((context, { nextDPath }) => ({
        ...context,
        t: 0,
        nextDPath,
        pathInterpolator: interpolatePath(context.nextDPath, nextDPath),
      })),
      updateIntermediateDPath: assign((context, _) => {
        const t = Math.min(context.t + context.rate, 1);
        const intermediateDPath = context.pathInterpolator(t);
        return { ...context, t, intermediateDPath };
      }),
      setupInterruptedAnimation: assign((context, { nextDPath }) => ({
        ...context,
        t: 0,
        nextDPath,
        pathInterpolator: interpolatePath(context.intermediateDPath, nextDPath),
      })),
    },
    guards: {
      isDPathDifferent: (context, event) =>
        event.nextDPath !== context.nextDPath,
      isAnimationFinished: (context) => context.t >= 1,
    },
    services: {
      animationLoop: () => (callback) => {
        let cancel = false;

        function step() {
          if (cancel) return;
          callback("tick");
          window.requestAnimationFrame(step);
        }

        step();

        return () => {
          cancel = true;
        };
      },
    },
  }
);

function useDPathAnimationMachine(dPath: string, rate = 0.02) {
  const [state, send] = useMachine(animationMachine, {
    context: { intermediateDPath: dPath, nextDPath: dPath, rate },
  });

  useEffect(() => {
    send({ type: "startAnimation", nextDPath: dPath });
  }, [dPath, send]);

  return state.context.intermediateDPath;
}

interface Context {
  state: "waiting" | "transitioning";
  previousDPath: string;
  nextDPath: string;
}

type Event =
  | { type: "startAnimation"; nextDPath: string }
  | { type: "interruptAnimation"; previousDPath: string }
  | { type: "finishAnimation" };

function reducer(context: Context, event: Event): Context {
  switch (event.type) {
    case "startAnimation": {
      if (context.state === "waiting") {
        return {
          ...context,
          state: "transitioning",
          nextDPath: event.nextDPath,
        };
      }
      return context;
    }
    case "interruptAnimation": {
      if (context.state === "transitioning") {
        return {
          ...context,
          state: "waiting",
          previousDPath: event.previousDPath,
        };
      }
      return context;
    }
    case "finishAnimation": {
      // Can only finish an animation that is currently happening
      if (context.state === "transitioning") {
        return {
          ...context,
          state: "waiting",
          previousDPath: context.nextDPath,
        };
      }
      return context;
    }
  }
}

function useDPath(newDPath: string, rate = 0.003) {
  const [{ state, previousDPath, nextDPath }, send] = useReducer(reducer, {
    state: "waiting",
    previousDPath: newDPath,
    nextDPath: newDPath,
  });
  const [intermediateDPath, setIntermediateDPath] = useState(newDPath);

  useEffect(() => {
    if (state === "waiting" && newDPath !== nextDPath) {
      send({ type: "startAnimation", nextDPath: newDPath });
      return;
    }

    if (state === "transitioning") {
      let cancel = false;
      let t = 0;
      const pathInterpolator = interpolatePath(previousDPath, nextDPath);
      function step() {
        if (cancel) return;
        if (t < 1) {
          t = Math.min(t + rate, 1);
          setIntermediateDPath(pathInterpolator(t));
          window.requestAnimationFrame(step);
        } else {
          send({ type: "finishAnimation" });
        }
      }

      step();

      return () => {
        if (t < 1) {
          cancel = true;
          send({
            type: "interruptAnimation",
            previousDPath: pathInterpolator(t),
          });
        }
      };
    }
  }, [newDPath, nextDPath, previousDPath, rate, send, state]);

  return intermediateDPath;
}

function LineItemDisplay({
  description,
  quantity,
  unitPrice,
}: {
  description: string;
  quantity: number;
  unitPrice: number;
}) {
  return (
    <div className={lineItemClassName}>
      <div>{description}</div>
      {quantity === 1 ? null : <div className="text-[10px]">({quantity}x)</div>}
      <div>{currencyFormatter.format(unitPrice)}</div>
    </div>
  );
}

export function CatchBoundary() {
  const caught = useCatch();
  const params = useParams();

  if (caught.status === 404) {
    return (
      <div className="p-12 text-red-500">
        No invoice found with the ID of "{params.invoiceId}"
      </div>
    );
  }

  throw new Error(`Unexpected caught response with status: ${caught.status}`);
}

export function ErrorBoundary({ error }: { error: Error }) {
  console.error(error);

  return (
    <div className="absolute inset-0 flex justify-center bg-red-100 pt-4">
      <div className="text-center text-red-brand">
        <div className="text-[14px] font-bold">Oh snap!</div>
        <div className="px-2 text-[12px]">There was a problem. Sorry.</div>
      </div>
    </div>
  );
}
