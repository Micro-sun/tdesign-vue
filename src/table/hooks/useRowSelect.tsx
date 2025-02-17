// 行选中相关功能：单选 + 多选
import {
  computed, toRefs, h, ref, watch,
} from '@vue/composition-api';
import intersection from 'lodash/intersection';
import get from 'lodash/get';
import { CreateElement } from 'vue';
import isFunction from 'lodash/isFunction';
import useDefaultValue from '../../hooks/useDefaultValue';
import {
  PrimaryTableCellParams,
  PrimaryTableCol,
  RowClassNameParams,
  TableRowData,
  TdPrimaryTableProps,
} from '../type';
import { isRowSelectedDisabled } from '../utils';
import { TableClassName } from './useClassName';
import Checkbox from '../../checkbox';
import Radio from '../../radio';
import { ClassName } from '../../common';
import log from '../../_common/js/log';

export default function useRowSelect(
  props: TdPrimaryTableProps,
  tableSelectedClasses: TableClassName['tableSelectedClasses'],
) {
  const {
    selectedRowKeys, columns, data, rowKey,
  } = toRefs(props);
  const selectedRowClassNames = ref();
  const [tSelectedRowKeys, setTSelectedRowKeys] = useDefaultValue(
    selectedRowKeys,
    props.defaultSelectedRowKeys || [],
    props.onSelectChange,
    'selectedRowKeys',
    'select-change',
  );
  const selectedRowDataMap = ref(new Map<string | number, TableRowData>());
  const selectColumn = computed(() => props.columns.find(({ type }) => ['multiple', 'single'].includes(type)));
  const canSelectedRows = computed(() => data.value.filter((row, rowIndex): boolean => !isDisabled(row, rowIndex)));
  // 选中的行，和所有可以选择的行，交集，用于计算 isSelectedAll 和 isIndeterminate
  const intersectionKeys = computed(() => intersection(
    tSelectedRowKeys.value,
    canSelectedRows.value.map((t) => get(t, props.rowKey || 'id')),
  ));

  watch(
    [data, columns, tSelectedRowKeys, selectColumn, rowKey],
    () => {
      const disabledRowFunc = (p: RowClassNameParams<TableRowData>): ClassName => selectColumn.value.disabled(p) ? tableSelectedClasses.disabled : '';
      const disabledRowClass = selectColumn.value?.disabled ? disabledRowFunc : undefined;
      const selected = new Set(tSelectedRowKeys.value);
      const selectedRowClassFunc = ({ row }: RowClassNameParams<TableRowData>) => {
        const rowId = get(row, props.rowKey || 'id');
        return selected.has(rowId) ? tableSelectedClasses.selected : '';
      };
      const selectedRowClass = selected.size ? selectedRowClassFunc : undefined;
      selectedRowClassNames.value = [disabledRowClass, selectedRowClass].filter((v) => v);
    },
    { immediate: true },
  );

  function isDisabled(row: Record<string, any>, rowIndex: number): boolean {
    return isRowSelectedDisabled(selectColumn.value, row, rowIndex);
  }

  // eslint-disable-next-line
  function getSelectedHeader(h: CreateElement) {
    // 判断条件直接写在jsx中，防止变量被computed捕获，选中行重新计算了columns
    return () => (
      <Checkbox
        checked={
          intersectionKeys.value.length !== 0
          && canSelectedRows.value.length !== 0
          && intersectionKeys.value.length === canSelectedRows.value.length
        }
        indeterminate={
          intersectionKeys.value.length > 0 && intersectionKeys.value.length < canSelectedRows.value.length
        }
        disabled={!canSelectedRows.value.length}
        {...{ on: { change: handleSelectAll } }}
      />
    );
  }

  // eslint-disable-next-line
  function renderSelectCell(h: CreateElement, p: PrimaryTableCellParams<TableRowData>) {
    const { col: column, row = {}, rowIndex } = p;
    const checked = tSelectedRowKeys.value.includes(get(row, props.rowKey || 'id'));
    const disabled = typeof column.disabled === 'function' ? column.disabled({ row, rowIndex }) : column.disabled;
    const checkProps = isFunction(column.checkProps) ? column.checkProps({ row, rowIndex }) : column.checkProps;
    const selectBoxProps = {
      props: {
        checked,
        disabled,
        ...checkProps,
      },
      on: {
        click: (e: MouseEvent) => {
          // 选中行功能中，点击 checkbox/radio 需阻止事件冒泡，避免触发不必要的 onRowClick
          e?.stopPropagation();
        },
        // radio 单选框可再点击一次关闭选择，input / change 事件无法监听
        change: () => handleSelectChange(row),
      },
    };
    if (column.type === 'single') return <Radio {...selectBoxProps} />;
    if (column.type === 'multiple') {
      const isIndeterminate = props.indeterminateSelectedRowKeys?.length
        ? props.indeterminateSelectedRowKeys.includes(get(row, props.rowKey))
        : false;
      return <Checkbox indeterminate={isIndeterminate} {...selectBoxProps} />;
    }
    return null;
  }

  function handleSelectChange(row: TableRowData = {}) {
    let selectedRowKeys = [...tSelectedRowKeys.value];
    const reRowKey = props.rowKey || 'id';
    const id = get(row, reRowKey);
    selectedRowDataMap.value.set(id, row);
    const selectedRowIndex = selectedRowKeys.indexOf(id);
    const isExisted = selectedRowIndex !== -1;
    if (selectColumn.value.type === 'multiple') {
      isExisted ? selectedRowKeys.splice(selectedRowIndex, 1) : selectedRowKeys.push(id);
    } else if (selectColumn.value.type === 'single') {
      selectedRowKeys = !isExisted ? [id] : [];
    } else {
      log.warn('Table', '`column.type` must be one of `multiple` and `single`');
      return;
    }
    setTSelectedRowKeys(selectedRowKeys, {
      selectedRowData: selectedRowKeys.map((t) => selectedRowDataMap.value.get(t)),
      currentRowKey: id,
      currentRowData: row,
      type: isExisted ? 'uncheck' : 'check',
    });
  }

  function handleSelectAll(checked: boolean) {
    const reRowKey = props.rowKey || 'id';
    const canSelectedRowKeys = canSelectedRows.value.map((record) => get(record, reRowKey));
    const disabledSelectedRowKeys = selectedRowKeys.value?.filter((id) => !canSelectedRowKeys.includes(id)) || [];
    const allIds = checked ? [...disabledSelectedRowKeys, ...canSelectedRowKeys] : [...disabledSelectedRowKeys];
    setTSelectedRowKeys(allIds, {
      selectedRowData: checked ? allIds.map((t) => selectedRowDataMap.value.get(t)) : [],
      type: checked ? 'check' : 'uncheck',
      currentRowKey: 'CHECK_ALL_BOX',
    });
  }

  function formatToRowSelectColumn(col: PrimaryTableCol) {
    const isSelection = ['multiple', 'single'].includes(col.type);
    if (!isSelection) return col;
    return {
      ...col,
      width: col.width || 64,
      className: [tableSelectedClasses.checkCell, col.className],
      cell: (h: CreateElement, p: PrimaryTableCellParams<TableRowData>) => renderSelectCell(h, p),
      title: col.type === 'multiple' ? getSelectedHeader(h) : '',
    };
  }

  watch(
    [data, rowKey],
    ([data, rowKey]) => {
      for (let i = 0, len = data.length; i < len; i++) {
        selectedRowDataMap.value.set(get(data[i], rowKey || 'id'), data[i]);
      }
    },
    { immediate: true },
  );

  return {
    selectedRowClassNames,
    formatToRowSelectColumn,
  };
}
